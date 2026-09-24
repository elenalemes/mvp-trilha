"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getSessao } from "@/lib/sessao";
import { lerConvite, linkDeConvite, novoConvite } from "@/lib/convite";
import { enviarWhatsApp, textoConviteParceiro } from "@/lib/notificacoes";

/**
 * O primeiro acesso do corretor, e o reenvio do convite.
 *
 * `definirPrimeiroAcesso` é a segunda escrita pública do sistema — quem chama
 * não tem sessão, então vai pela chave de servidor, com a forma fixa e a regra
 * escrita aqui. É o momento em que o LOGIN passa a existir: até então havia
 * cadastro e convite, mais nada.
 */

export type ResultadoConvite = { ok: true } | { ok: false; erro: string };

// ------------------------------------------------------- primeiro acesso

export async function definirPrimeiroAcesso(
  token: string,
  senha: string,
): Promise<ResultadoConvite> {
  if (!senha || senha.length < 8) {
    return { ok: false, erro: "A senha precisa ter ao menos 8 caracteres." };
  }

  const convite = await lerConvite(token);
  if (!convite.ok) {
    return {
      ok: false,
      erro:
        convite.motivo === "usado"
          ? "Este convite já foi usado. Entre com o seu e-mail e senha."
          : convite.motivo === "expirado"
            ? "Este convite venceu. Peça um novo à equipe da Trilha."
            : "Convite não encontrado. Confira o link que você recebeu.",
    };
  }

  const { id, nome, email } = convite.parceiro;
  const admin = createAdminClient();

  const { data: usuario, error: erroUsuario } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  });

  if (erroUsuario || !usuario?.user) {
    const jaExiste = erroUsuario?.message?.toLowerCase().includes("already");
    console.error("[convite] falha ao criar usuário:", erroUsuario);
    return {
      ok: false,
      erro: jaExiste
        ? "Já existe um acesso com este e-mail. Tente entrar pela tela de login."
        : "Não consegui criar o seu acesso. Tente de novo em instantes.",
    };
  }

  const contaId = usuario.user.id;

  const { error: erroConta } = await admin.from("conta").insert({
    id: contaId,
    tipo: "parceiro",
    nome,
    email,
  });

  if (erroConta) {
    await admin.auth.admin.deleteUser(contaId);
    console.error("[convite] falha ao criar conta:", erroConta);
    return { ok: false, erro: "Não consegui criar o seu acesso. Tente de novo em instantes." };
  }

  // Liga o login ao cadastro e QUEIMA o convite na mesma escrita: token nulo é
  // o que impede o mesmo link de criar um segundo acesso.
  const { error: erroLigar } = await admin
    .from("parceiro")
    .update({ conta_id: contaId, convite_token: null, convite_expira_em: null })
    .eq("id", id)
    .is("conta_id", null);

  if (erroLigar) {
    await admin.from("conta").delete().eq("id", contaId);
    await admin.auth.admin.deleteUser(contaId);
    console.error("[convite] falha ao ligar parceiro:", erroLigar);
    return { ok: false, erro: "Não consegui concluir o seu acesso. Tente de novo em instantes." };
  }

  // Já entra logado. Ele acabou de digitar a senha — pedir de novo na tela
  // seguinte seria pedir duas vezes a mesma coisa.
  const supabase = await createClient();
  await supabase.auth.signInWithPassword({ email, password: senha });

  return { ok: true };
}

// ------------------------------------------------------------- reenviar

/**
 * Um convite novo para quem não recebeu o primeiro.
 *
 * Gera outro token — o antigo morre junto. Se o WhatsApp não chegou porque o
 * telefone está errado, corrigir o cadastro e reenviar é o caminho.
 */
export async function reenviarConvite(parceiroId: string): Promise<ResultadoConvite> {
  const sessao = await getSessao();
  if (!sessao?.conta) return { ok: false, erro: "Sessão expirada. Entre de novo." };

  // Leitura pela sessão: quem não enxerga o parceiro não reenvia convite dele.
  const supabase = await createClient();
  const { data: parceiro } = await supabase
    .from("parceiro")
    .select("id, nome, telefone, conta_id, incorporadora_id")
    .eq("id", parceiroId)
    .maybeSingle<{
      id: string;
      nome: string;
      telefone: string;
      conta_id: string | null;
      incorporadora_id: string | null;
    }>();

  if (!parceiro) return { ok: false, erro: "Parceiro não encontrado, ou sem permissão." };
  if (parceiro.conta_id) {
    return { ok: false, erro: "Este parceiro já tem acesso. Não há convite a reenviar." };
  }

  const { token, expiraEm } = novoConvite();
  const admin = createAdminClient();

  const { error } = await admin
    .from("parceiro")
    .update({ convite_token: token, convite_expira_em: expiraEm })
    .eq("id", parceiroId);

  if (error) {
    console.error("[convite] falha ao gravar novo token:", error);
    return { ok: false, erro: "Não consegui gerar um convite novo." };
  }

  const link = await linkDeConvite(token);
  const envio = await enviarWhatsApp(
    parceiro.telefone,
    textoConviteParceiro({ nome: parceiro.nome, link }),
  );

  await admin
    .from("parceiro")
    .update({
      convite_enviado_em: envio.ok ? new Date().toISOString() : null,
      convite_canal: envio.ok ? "whatsapp" : null,
    })
    .eq("id", parceiroId);

  revalidatePath("/parceiros");
  revalidatePath(`/parceiros/${parceiroId}/acesso`);

  if (!envio.ok) {
    // O convite existe mesmo sem o envio ter dado certo: a tela mostra o link
    // para copiar, e a Trilha manda por onde conseguir.
    return {
      ok: false,
      erro: `O convite foi gerado, mas o WhatsApp não saiu (${envio.erro}). Copie o link e envie você mesmo.`,
    };
  }

  return { ok: true };
}
