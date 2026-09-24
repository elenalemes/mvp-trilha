"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { linkDoSite } from "@/lib/site";
import {
  enviarWhatsApp,
  textoAceitaComprador,
  textoAceitaCorretor,
  textoAceitaCorretorAcompanha,
  textoAceitaIncorporadora,
} from "@/lib/notificacoes";

/**
 * Aceitar e recusar proposta.
 *
 * Fica separado de `actions/propostas.ts` de propósito: lá é a escrita
 * PÚBLICA, feita com a chave de servidor porque quem envia não tem identidade
 * no banco. Aqui é o contrário — a decisão é de gente logada, e usa o cliente
 * da sessão justamente para que `eh_admin_trilha()` e `auth.uid()` valham
 * dentro das funções do banco.
 *
 * Nenhuma das duas faz `update` direto. Aceitar mexe em três lugares que não
 * podem ficar pela metade (a proposta, o imóvel, as propostas concorrentes), e
 * quem garante isso é a transação dentro de `aceitar_proposta`.
 */

export type ResultadoDecisao = { ok: true } | { ok: false; erro: string };

type ErroBanco = { code?: string; message?: string } | null;

function traduzir(error: ErroBanco): string {
  if (!error) return "Não consegui concluir. Tente de novo.";

  // As funções do banco levantam exceção com texto já escrito para gente.
  // Quando vier uma dessas, ela é melhor do que qualquer coisa que eu
  // reescrevesse aqui.
  if (error.code === "42501" || error.code === "22023" || error.code === "P0002") {
    return error.message ?? "Esta proposta não pode mais ser decidida.";
  }

  console.error("[proposta] falha na decisão:", error);
  return "Não consegui concluir a decisão. Tente de novo em instantes.";
}

function revalidar(id: string) {
  revalidatePath("/propostas");
  revalidatePath(`/propostas/${id}`);
  // Aceitar tira a unidade do estoque disponível — as telas de imóvel mudam
  // junto, e é feio o corretor ver a unidade à venda logo depois.
  revalidatePath("/empreendimentos");
  revalidatePath("/imoveis");
}

export async function aceitarProposta(id: string, motivo?: string): Promise<ResultadoDecisao> {
  const supabase = await createClient();

  const { data: negocioId, error } = await supabase.rpc("aceitar_proposta", {
    p_proposta: id,
    p_motivo: motivo?.trim() || null,
  });

  if (error) return { ok: false, erro: traduzir(error) };

  // Os avisos vêm DEPOIS e nunca derrubam a aceitação: o negócio já existe, e
  // um WhatsApp fora do ar não pode desfazer uma decisão comercial. O que
  // falhar vai para o terminal e pode ser reenviado pela ficha.
  if (typeof negocioId === "string") await avisarDaAceitacao(supabase, id, negocioId);

  revalidar(id);
  return { ok: true };
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

type Envolvidos = {
  codigo: string;
  imovel: { identificacao: string } | null;
  empreendimento: { nome: string } | null;
  parceiro: { nome: string; telefone: string } | null;
  comprador: { nome: string; telefone: string } | null;
  incorporadora: { resp_nome: string | null; resp_telefone: string | null; telefone: string | null } | null;
};

/**
 * Avisar as três pontas no WhatsApp.
 *
 * Cada uma recebe o link que é dela: o comprador, a página pública de
 * acompanhamento; o corretor e a incorporadora, o fechamento no painel, que é
 * onde eles têm tarefas.
 *
 * Tudo em paralelo e tolerante a falha — se o número da incorporadora estiver
 * vazio, as outras duas mensagens saem do mesmo jeito.
 */
async function avisarDaAceitacao(supabase: Supabase, propostaId: string, negocioId: string) {
  try {
    const [{ data: proposta }, { data: negocio }, { data: acompanham }] = await Promise.all([
      supabase
        .from("proposta")
        .select(
          `codigo,
           imovel (identificacao),
           empreendimento (nome),
           parceiro!parceiro_id (nome, telefone),
           comprador (nome, telefone),
           incorporadora (resp_nome, resp_telefone, telefone)`,
        )
        .eq("id", propostaId)
        .maybeSingle<Envolvidos>(),
      supabase
        .from("negocio")
        .select("token")
        .eq("id", negocioId)
        .maybeSingle<{ token: string }>(),
      // Os outros corretores da divisão da comissão (condição especial).
      supabase
        .from("proposta_corretor")
        .select("parceiro (nome, telefone)")
        .eq("proposta_id", propostaId)
        .eq("principal", false)
        .returns<{ parceiro: { nome: string; telefone: string } | null }[]>(),
    ]);

    if (!proposta || !negocio) return;

    const unidade = proposta.imovel?.identificacao ?? "";
    const empreendimento = proposta.empreendimento?.nome ?? "";

    const [linkComprador, linkPainel] = await Promise.all([
      linkDoSite(`/acompanhar?t=${negocio.token}`),
      linkDoSite(`/negocios/${negocioId}`),
    ]);

    const envios: { quem: string; telefone: string; texto: string }[] = [];

    if (proposta.comprador?.telefone) {
      envios.push({
        quem: "comprador",
        telefone: proposta.comprador.telefone,
        texto: textoAceitaComprador({
          nome: proposta.comprador.nome,
          link: linkComprador,
          unidade,
          empreendimento,
        }),
      });
    }

    if (proposta.parceiro?.telefone) {
      envios.push({
        quem: "corretor",
        telefone: proposta.parceiro.telefone,
        texto: textoAceitaCorretor({
          nome: proposta.parceiro.nome,
          link: linkPainel,
          codigo: proposta.codigo,
          unidade,
          empreendimento,
        }),
      });
    }

    for (const { parceiro } of acompanham ?? []) {
      if (!parceiro?.telefone) continue;
      envios.push({
        quem: `corretor ${parceiro.nome}`,
        telefone: parceiro.telefone,
        texto: textoAceitaCorretorAcompanha({
          nome: parceiro.nome,
          link: linkPainel,
          codigo: proposta.codigo,
          unidade,
          empreendimento,
        }),
      });
    }

    // O responsável primeiro; o telefone da empresa é o reserva.
    const telefoneInc = proposta.incorporadora?.resp_telefone || proposta.incorporadora?.telefone;
    if (telefoneInc) {
      envios.push({
        quem: "incorporadora",
        telefone: telefoneInc,
        texto: textoAceitaIncorporadora({
          nome: proposta.incorporadora?.resp_nome || "equipe",
          link: linkPainel,
          unidade,
          empreendimento,
        }),
      });
    }

    const resultados = await Promise.all(
      envios.map(async (e) => ({ quem: e.quem, r: await enviarWhatsApp(e.telefone, e.texto) })),
    );

    for (const { quem, r } of resultados) {
      if (!r.ok) console.error(`[proposta aceita] aviso ao ${quem} não saiu:`, r.erro);
    }
  } catch (e) {
    console.error("[proposta aceita] falha ao avisar as partes:", e);
  }
}

export async function recusarProposta(id: string, motivo?: string): Promise<ResultadoDecisao> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("recusar_proposta", {
    p_proposta: id,
    p_motivo: motivo?.trim() || null,
  });

  if (error) return { ok: false, erro: traduzir(error) };

  revalidar(id);
  return { ok: true };
}
