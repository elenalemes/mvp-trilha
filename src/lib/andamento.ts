import { createAdminClient } from "@/lib/supabase/admin";
import { linkDoSite } from "@/lib/site";
import { estaFechada, nivelAberto, type Tarefa } from "@/lib/fechamento";
import { after } from "next/server";
import { criarAviso, despachar, digitosDe, enfileirar, type NovaMensagem } from "@/lib/avisos";
import { ASSUNTO_DO_MARCO, textoAndamento, type MarcoAndamento, type PapelAviso } from "@/lib/notificacoes";

/**
 * Os avisos de andamento do fechamento.
 *
 * Um aviso por NÍVEL que abre, e não por tarefa — o checklist tem mais de
 * vinte tarefas, e vinte WhatsApps fariam todo mundo silenciar a Trilha.
 * Além dos níveis, dois marcos que pedem ação ou celebração:
 *
 *   contrato     nível do Contrato abriu: a minuta vai junto, para revisar
 *   assinatura   "Enviar para assinatura" concluída: confira seu e-mail
 *   pagamentos   nível de Pagamentos abriu (contrato assinado)
 *   chaves       nível da Entrega de chaves abriu
 *   trilha       tudo fechado: chaves liberadas, a trilha começou
 *
 * QUEM CHAMA: as actions que mexem no checklist, depois de a escrita dar
 * certo (a escrita pela sessão é a prova de que a pessoa podia mexer naquele
 * negócio), e a rotina diária, como rede de segurança — tarefa fechada por
 * gatilho do banco também chega aqui no máximo um dia depois.
 *
 * SEM DUPLICIDADE, em duas camadas: a marca no negócio só avança por update
 * condicional (quem não conseguiu mudar a marca não manda nada), e cada
 * mensagem tem chave própria na fila.
 *
 * Não é "use server": nada aqui confere quem chama.
 */

type Admin = ReturnType<typeof createAdminClient>;
type Pessoa = { nome: string; telefone: string | null };

type LinhaNegocio = {
  id: string;
  status: string;
  token: string;
  proposta_id: string;
  nivel_avisado: number;
  aviso_assinatura_em: string | null;
  aviso_trilha_em: string | null;
  imovel: { identificacao: string } | null;
  empreendimento: { nome: string } | null;
  parceiro: Pessoa | null;
  comprador: Pessoa | null;
  incorporadora: { tipo: string; resp_nome: string | null; resp_telefone: string | null; telefone: string | null } | null;
};

const MARCO_DA_ETAPA: Record<string, MarcoAndamento> = {
  contrato: "contrato",
  pagamentos: "pagamentos",
  "entrega de chaves": "chaves",
};

const TITULO_ADMIN: Record<MarcoAndamento, string> = {
  documentos: "vendedor enviou todos os documentos",
  contrato: "documentação completa, contrato em redação",
  assinatura: "contrato enviado para assinatura",
  pagamentos: "contrato assinado, pagamentos iniciais",
  chaves: "pagamentos confirmados, entrega de chaves",
  trilha: "chaves liberadas, virou trilha",
};

/** Avança a marca do negócio só se ninguém avançou antes. true = esta chamada avisa. */
async function travar(admin: Admin, negocioId: string, campo: "nivel" | "assinatura" | "trilha", nivel?: number) {
  let q;
  if (campo === "nivel") {
    q = admin.from("negocio").update({ nivel_avisado: nivel }).eq("id", negocioId).lt("nivel_avisado", nivel!);
  } else {
    const coluna = campo === "assinatura" ? "aviso_assinatura_em" : "aviso_trilha_em";
    q = admin
      .from("negocio")
      .update({ [coluna]: new Date().toISOString(), ...(campo === "trilha" ? { nivel_avisado: 99 } : {}) })
      .eq("id", negocioId)
      .is(coluna, null);
  }
  const { data } = await q.select("id");
  return (data?.length ?? 0) > 0;
}

export type ResultadoAndamento = { marcos: MarcoAndamento[]; mensagens: string[] };

const NADA: ResultadoAndamento = { marcos: [], mensagens: [] };

export async function avisarAndamento(negocioId: string, admin: Admin = createAdminClient()): Promise<ResultadoAndamento> {
  try {
    const { data: n } = await admin
      .from("negocio")
      .select(
        `id, status, token, proposta_id, nivel_avisado, aviso_assinatura_em, aviso_trilha_em,
         imovel (identificacao), empreendimento (nome),
         parceiro (nome, telefone), comprador (nome, telefone),
         incorporadora (tipo, resp_nome, resp_telefone, telefone)`,
      )
      .eq("id", negocioId)
      .maybeSingle<LinhaNegocio>();

    if (!n || n.status === "cancelado") return NADA;

    const { data: lista } = await admin
      .from("checklist_item")
      .select("etapa, etapa_ordem, titulo, status, ator")
      .eq("negocio_id", negocioId)
      .returns<Pick<Tarefa, "etapa" | "etapa_ordem" | "titulo" | "status" | "ator">[]>();
    const tarefas = (lista ?? []) as Tarefa[];
    if (tarefas.length === 0) return NADA;

    const nivel = nivelAberto(tarefas);
    const marcos: MarcoAndamento[] = [];

    // ------------------------------------- 0. o vendedor terminou a parte dele
    // Todas as tarefas da incorporadora no nível 1 fechadas: ela recebe o
    // link de acompanhamento. Só enquanto o nível 1 não tinha sido avisado
    // como encerrado — negócio antigo não recebe isto de surpresa. Repetir a
    // conferência não repete a mensagem (a chave da fila é a mesma).
    const doVendedor = tarefas.filter((t) => t.ator === "incorporadora" && t.etapa_ordem === 1);
    if (n.nivel_avisado <= 1 && !n.aviso_trilha_em && doVendedor.length > 0 && doVendedor.every(estaFechada)) {
      marcos.push("documentos");
    }

    // ------------------------------------------------- 1. a trilha começou
    // Quando tudo fechou, só este aviso sai: os níveis que passaram juntos
    // ficam para trás sem mensagem (a marca vai a 99).
    if ((nivel === null || n.status !== "em_fechamento") && !n.aviso_trilha_em) {
      if (await travar(admin, negocioId, "trilha")) marcos.push("trilha");
    } else if (nivel !== null) {
      // ------------------------------------------------ 2. o nível que abriu
      if (nivel > n.nivel_avisado && (await travar(admin, negocioId, "nivel", nivel))) {
        const etapasDoNivel = [...new Set(tarefas.filter((t) => t.etapa_ordem === nivel).map((t) => t.etapa.toLowerCase()))];
        const marco = etapasDoNivel.map((e) => MARCO_DA_ETAPA[e]).find(Boolean);
        if (marco) marcos.push(marco);
      }

      // ------------------------------------------- 3. enviado para assinatura
      // Se o nível do contrato já fechou junto (tudo marcado de uma vez), a
      // marca avança sem mensagem: "confira seu e-mail" depois de "contrato
      // assinado" só confunde.
      const envio = tarefas.find((t) => /^enviar para assinatura/i.test(t.titulo) && t.status === "concluido");
      if (envio && !n.aviso_assinatura_em && (await travar(admin, negocioId, "assinatura")) && envio.etapa_ordem === nivel) {
        marcos.push("assinatura");
      }
    }

    if (marcos.length === 0) return NADA;

    const { data: outros } = await admin
      .from("proposta_corretor")
      .select("parceiro (nome, telefone)")
      .eq("proposta_id", n.proposta_id)
      .eq("principal", false)
      .returns<{ parceiro: Pessoa | null }[]>();

    const rotaPainel = n.status === "em_fechamento" ? `/negocios/${negocioId}` : `/trilhas/${negocioId}`;
    const [linkComprador, linkPainel, linkMinuta] = await Promise.all([
      linkDoSite(`/acompanhar?t=${n.token}`),
      linkDoSite(rotaPainel),
      linkDoSite(`/minuta?t=${n.token}`),
    ]);

    const telVendedor = n.incorporadora?.resp_telefone || n.incorporadora?.telefone || null;
    const pf = n.incorporadora?.tipo === "proprietario_pf";
    const pessoas: { papel: PapelAviso; nome: string; telefone: string | null; rotulo: string; link: string }[] = [
      { papel: "comprador", nome: n.comprador?.nome ?? "", telefone: n.comprador?.telefone ?? null, rotulo: "comprador", link: linkComprador },
      { papel: "corretor", nome: n.parceiro?.nome ?? "", telefone: n.parceiro?.telefone ?? null, rotulo: "corretor", link: linkPainel },
      ...(outros ?? []).map((o) => ({
        papel: "corretor" as const,
        nome: o.parceiro?.nome ?? "",
        telefone: o.parceiro?.telefone ?? null,
        rotulo: "corretor",
        link: linkPainel,
      })),
      {
        papel: "vendedor",
        nome: n.incorporadora?.resp_nome || "equipe",
        telefone: telVendedor,
        rotulo: pf ? "proprietário" : "incorporadora",
        link: linkPainel,
      },
    ];

    const unidade = n.imovel?.identificacao ?? "";
    const empreendimento = n.empreendimento?.nome ?? "";
    const msgs: NovaMensagem[] = [];

    for (const marco of marcos) {
      for (const p of pessoas) {
        if (!p.telefone) continue;
        if (marco === "documentos" && p.papel !== "vendedor") continue;
        msgs.push({
          chave: `andamento:${negocioId}:${marco}:${p.papel}:${digitosDe(p.telefone)}`,
          destino: p.telefone,
          destinatario: `${p.nome || p.rotulo} (${p.rotulo})`,
          papel: p.papel,
          assunto: ASSUNTO_DO_MARCO[marco],
          negocioId,
          propostaId: n.proposta_id,
          texto: textoAndamento({
            marco,
            papel: p.papel,
            nome: p.nome || p.rotulo,
            unidade,
            empreendimento,
            // A incorporadora recebe a página de acompanhamento nesta: é o
            // jeito de ela ver o andamento sem ter tarefa nenhuma aberta.
            link: marco === "documentos" ? linkComprador : p.link,
            linkMinuta,
            vendedorPF: pf,
          }),
        });
      }

      await criarAviso(admin, {
        chave: `andamento:${negocioId}:${marco}`,
        tipo: "andamento",
        titulo: `${unidade}: ${TITULO_ADMIN[marco]}`,
        texto: empreendimento,
        link: rotaPainel,
      });
    }

    return { marcos, mensagens: await enfileirar(admin, msgs) };
  } catch (e) {
    console.error("[andamento] falha ao avisar:", negocioId, e);
    return NADA;
  }
}

/**
 * Para as actions: confere o andamento agora e manda as mensagens depois que
 * a resposta já voltou para a tela. Nunca derruba a action que chamou.
 */
export async function conferirAndamento(negocioId: string): Promise<void> {
  const admin = createAdminClient();
  const { mensagens } = await avisarAndamento(negocioId, admin);
  if (mensagens.length) after(() => despachar(admin, mensagens));
}

/**
 * A rede de segurança da rotina: passa pelos negócios abertos e avisa o que
 * ficou para trás. Só grava na fila; quem manda é a varredura da fila, logo
 * em seguida, na mesma rotina.
 */
export async function varrerAndamento(admin: Admin, ate: number) {
  const { data } = await admin
    .from("negocio")
    .select("id")
    .or("status.eq.em_fechamento,aviso_trilha_em.is.null")
    .neq("status", "cancelado")
    .order("updated_at", { ascending: false })
    .limit(200);

  let avisados = 0;
  for (const { id } of (data ?? []) as { id: string }[]) {
    if (Date.now() > ate) break;
    if ((await avisarAndamento(id, admin)).marcos.length) avisados += 1;
  }
  return { negocios: data?.length ?? 0, avisados };
}
