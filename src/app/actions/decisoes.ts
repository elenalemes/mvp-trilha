"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { linkDoSite } from "@/lib/site";
import { despachar, digitosDe, enfileirar, type NovaMensagem } from "@/lib/avisos";
import {
  textoAceitaComprador,
  textoAceitaCorretor,
  textoAceitaCorretorAcompanha,
  textoAceitaIncorporadora,
  textoAceitaProprietario,
  textoRecusaComprador,
  textoRecusaCorretor,
  textoRecusaVendedor,
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
  // falhar fica no sino e pode ser reenviado em Avisos → Mensagens.
  if (typeof negocioId === "string") await avisarDaAceitacao(supabase, id, negocioId);

  revalidar(id);
  return { ok: true };
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

type Pessoa = { nome: string; telefone: string };

type Envolvidos = {
  codigo: string;
  origem: string | null;
  motivo_decisao: string | null;
  imovel: { identificacao: string } | null;
  empreendimento: { nome: string } | null;
  parceiro: Pessoa | null;
  comprador: Pessoa | null;
  incorporadora: {
    resp_nome: string | null;
    resp_telefone: string | null;
    telefone: string | null;
    tipo: string;
  } | null;
  /** Os outros corretores da divisão da comissão (condição especial). */
  acompanham: Pessoa[];
};

/**
 * Quem está na proposta e como falar com cada um.
 *
 * Lido com o cliente da SESSÃO (o admin que acabou de decidir): as colunas de
 * contato da incorporadora são liberadas para ele, e assim a leitura não
 * passa por cima de regra nenhuma.
 */
async function lerEnvolvidos(supabase: Supabase, propostaId: string): Promise<Envolvidos | null> {
  const [{ data: proposta }, { data: outros }] = await Promise.all([
    supabase
      .from("proposta")
      .select(
        `codigo, origem, motivo_decisao,
         imovel (identificacao),
         empreendimento (nome),
         parceiro!parceiro_id (nome, telefone),
         comprador (nome, telefone),
         incorporadora (resp_nome, resp_telefone, telefone, tipo)`,
      )
      .eq("id", propostaId)
      .maybeSingle<Omit<Envolvidos, "acompanham">>(),
    supabase
      .from("proposta_corretor")
      .select("parceiro (nome, telefone)")
      .eq("proposta_id", propostaId)
      .eq("principal", false)
      .returns<{ parceiro: Pessoa | null }[]>(),
  ]);

  if (!proposta) return null;
  return {
    ...proposta,
    acompanham: (outros ?? []).flatMap((o) => (o.parceiro?.telefone ? [o.parceiro] : [])),
  };
}

/** O responsável primeiro; o telefone da empresa é o reserva. */
const telefoneDoVendedor = (e: Envolvidos) => e.incorporadora?.resp_telefone || e.incorporadora?.telefone || null;

/**
 * Avisar as pontas no WhatsApp, pela fila.
 *
 * Cada uma recebe o link que é dela: o comprador, a página pública de
 * acompanhamento; o corretor e a incorporadora, o fechamento no painel, que é
 * onde eles têm tarefas.
 *
 * As mensagens são GRAVADAS aqui e saem depois da resposta (`after`): a tela
 * do admin não espera a uazapi, e o que falhar fica no sino e em
 * Avisos → Mensagens, com botão de reenviar.
 */
async function avisarDaAceitacao(supabase: Supabase, propostaId: string, negocioId: string) {
  try {
    const [e, { data: negocio }] = await Promise.all([
      lerEnvolvidos(supabase, propostaId),
      supabase.from("negocio").select("token").eq("id", negocioId).maybeSingle<{ token: string }>(),
    ]);
    if (!e || !negocio) return;

    const unidade = e.imovel?.identificacao ?? "";
    const empreendimento = e.empreendimento?.nome ?? "";

    const [linkComprador, linkPainel] = await Promise.all([
      linkDoSite(`/acompanhar?t=${negocio.token}`),
      linkDoSite(`/negocios/${negocioId}`),
    ]);

    const base = { propostaId, negocioId };
    const chave = (papel: string, tel: string) => `aceite:${negocioId}:${papel}:${digitosDe(tel)}`;
    const assunto = e.origem === "trilha" ? "Negociação aberta" : "Proposta aceita";
    const msgs: NovaMensagem[] = [];

    if (e.comprador?.telefone) {
      msgs.push({
        ...base,
        chave: chave("comprador", e.comprador.telefone),
        destino: e.comprador.telefone,
        destinatario: `${e.comprador.nome} (comprador)`,
        papel: "comprador",
        assunto,
        texto: textoAceitaComprador({
          nome: e.comprador.nome,
          link: linkComprador,
          unidade,
          empreendimento,
          pelaTrilha: e.origem === "trilha",
        }),
      });
    }

    if (e.parceiro?.telefone) {
      msgs.push({
        ...base,
        chave: chave("corretor", e.parceiro.telefone),
        destino: e.parceiro.telefone,
        destinatario: `${e.parceiro.nome} (corretor)`,
        papel: "corretor",
        assunto,
        texto: textoAceitaCorretor({ nome: e.parceiro.nome, link: linkPainel, codigo: e.codigo, unidade, empreendimento }),
      });
    }

    for (const p of e.acompanham) {
      msgs.push({
        ...base,
        chave: chave("corretor", p.telefone),
        destino: p.telefone,
        destinatario: `${p.nome} (corretor)`,
        papel: "corretor",
        assunto,
        texto: textoAceitaCorretorAcompanha({ nome: p.nome, link: linkPainel, codigo: e.codigo, unidade, empreendimento }),
      });
    }

    const telVendedor = telefoneDoVendedor(e);
    if (telVendedor) {
      const pf = e.incorporadora?.tipo === "proprietario_pf";
      msgs.push({
        ...base,
        chave: chave("vendedor", telVendedor),
        destino: telVendedor,
        destinatario: `${e.incorporadora?.resp_nome || "vendedor"} (${pf ? "proprietário" : "incorporadora"})`,
        papel: "vendedor",
        assunto,
        texto: (pf ? textoAceitaProprietario : textoAceitaIncorporadora)({
          nome: e.incorporadora?.resp_nome || "equipe",
          link: linkPainel,
          unidade,
          empreendimento,
        }),
      });
    }

    await enfileirarEDespachar(msgs);
  } catch (err) {
    console.error("[proposta aceita] falha ao avisar as partes:", err);
  }
}

export async function recusarProposta(id: string, motivo?: string): Promise<ResultadoDecisao> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("recusar_proposta", {
    p_proposta: id,
    p_motivo: motivo?.trim() || null,
  });

  if (error) return { ok: false, erro: traduzir(error) };

  // Mesma regra da aceitação: a recusa já valeu; aviso que falha não a desfaz.
  await avisarDaRecusa(supabase, id);

  revalidar(id);
  return { ok: true };
}

/**
 * Recusa: o corretor recebe o MOTIVO (é ele quem conversa com o cliente); o
 * comprador e o vendedor recebem uma mensagem neutra, sem motivo.
 */
async function avisarDaRecusa(supabase: Supabase, propostaId: string) {
  try {
    const e = await lerEnvolvidos(supabase, propostaId);
    if (!e) return;

    const unidade = e.imovel?.identificacao ?? "";
    const empreendimento = e.empreendimento?.nome ?? "";
    const linkPainel = await linkDoSite(`/propostas/${propostaId}`);
    const chave = (papel: string, tel: string) => `recusa:${propostaId}:${papel}:${digitosDe(tel)}`;
    const base = { propostaId, assunto: "Proposta recusada" };
    const msgs: NovaMensagem[] = [];

    for (const c of [e.parceiro, ...e.acompanham]) {
      if (!c?.telefone) continue;
      msgs.push({
        ...base,
        chave: chave("corretor", c.telefone),
        destino: c.telefone,
        destinatario: `${c.nome} (corretor)`,
        papel: "corretor",
        texto: textoRecusaCorretor({
          nome: c.nome,
          codigo: e.codigo,
          unidade,
          empreendimento,
          motivo: e.motivo_decisao,
          link: linkPainel,
        }),
      });
    }

    if (e.comprador?.telefone) {
      msgs.push({
        ...base,
        chave: chave("comprador", e.comprador.telefone),
        destino: e.comprador.telefone,
        destinatario: `${e.comprador.nome} (comprador)`,
        papel: "comprador",
        texto: textoRecusaComprador({
          nome: e.comprador.nome,
          unidade,
          empreendimento,
          corretor: e.parceiro?.nome ?? null,
        }),
      });
    }

    const telVendedor = telefoneDoVendedor(e);
    if (telVendedor) {
      const pf = e.incorporadora?.tipo === "proprietario_pf";
      msgs.push({
        ...base,
        chave: chave("vendedor", telVendedor),
        destino: telVendedor,
        destinatario: `${e.incorporadora?.resp_nome || "vendedor"} (${pf ? "proprietário" : "incorporadora"})`,
        papel: "vendedor",
        texto: textoRecusaVendedor({
          nome: e.incorporadora?.resp_nome || "equipe",
          codigo: e.codigo,
          unidade,
          empreendimento,
        }),
      });
    }

    await enfileirarEDespachar(msgs);
  } catch (err) {
    console.error("[proposta recusada] falha ao avisar as partes:", err);
  }
}

/** Grava agora; manda depois que a resposta já saiu para a tela. */
async function enfileirarEDespachar(msgs: NovaMensagem[]) {
  const admin = createAdminClient();
  const ids = await enfileirar(admin, msgs);
  if (ids.length) after(() => despachar(admin, ids));
}
