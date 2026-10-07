/**
 * A rotina de repasse: dias 14 e 15 (`config_financeiro`), dentro do cron das
 * 6h. Fora da janela não faz nada — a não ser que o admin peça pelo botão
 * "gerar repasses agora" (`forcar`).
 *
 *   1. interruptor `repasse_ligado` desligado → para;
 *   2. lote preso em "enviando" há mais de 15 min (queda no meio) → "verificar";
 *   3. monta os lotes: um por pessoa, com a soma dos repasses prontos;
 *   4. envia os lotes preparados (inclusive sobras de ontem);
 *   5. registra em `rotina_execucao` e manda UM WhatsApp: quanto ficou
 *      esperando aprovação no Asaas e o que deu problema.
 */

import type { createAdminClient } from "@/lib/supabase/admin";
import { enviarLote } from "@/lib/repasse";
import { enviarWhatsApp } from "@/lib/notificacoes";
import { criarAviso } from "@/lib/avisos";
import type { AmbienteAsaas } from "@/lib/asaas";

type Admin = ReturnType<typeof createAdminClient>;

const LIMITE_MS = 40_000;

export type ResumoRepasse = {
  data: string;
  executou: boolean;
  motivo?: string;
  lotesMontados: number;
  enviados: { nome: string; valor: number }[];
  problemas: { nome: string; erro: string; situacao: string }[];
  presosParaVerificar: number;
  interrompidaPorTempo: boolean;
  alertaEnviado: boolean | null;
};

type Config = {
  repasse_ligado: boolean;
  dia_repasse_inicio: number;
  dia_repasse_fim: number;
  telefone_alerta: string | null;
  asaas_ambiente: AmbienteAsaas;
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (iso: string) => iso.split("-").reverse().join("/");

export async function rodarRepasse(
  admin: Admin,
  hoje: string,
  /** `ate`: horário-limite (ms) — quem chama sabe quanto tempo já gastou. */
  opcoes: { forcar?: boolean; ate?: number } = {},
): Promise<ResumoRepasse> {
  // Para de ENVIAR com folga: um pedido ao Asaas não pode ser cortado no meio.
  const prazo = opcoes.ate ?? Date.now() + LIMITE_MS;
  const resumo: ResumoRepasse = {
    data: hoje,
    executou: false,
    lotesMontados: 0,
    enviados: [],
    problemas: [],
    presosParaVerificar: 0,
    interrompidaPorTempo: false,
    alertaEnviado: null,
  };

  const { data: cfg } = await admin
    .from("config_financeiro")
    .select("repasse_ligado, dia_repasse_inicio, dia_repasse_fim, telefone_alerta, asaas_ambiente")
    .maybeSingle<Config>();

  if (!cfg) return { ...resumo, motivo: "config_financeiro não encontrada" };
  if (!cfg.repasse_ligado) return { ...resumo, motivo: "repasse desligado" };

  const dia = Number(hoje.slice(8, 10));
  if (!opcoes.forcar && (dia < cfg.dia_repasse_inicio || dia > cfg.dia_repasse_fim)) {
    return { ...resumo, motivo: "fora da janela de repasse" };
  }

  resumo.executou = true;
  const { data: execucao } = await admin
    .from("rotina_execucao")
    .insert({ rotina: "repasse", data_ref: hoje })
    .select("id")
    .maybeSingle<{ id: string }>();

  const terminar = async (erro?: string) => {
    if (execucao) {
      await admin
        .from("rotina_execucao")
        .update({ terminou_em: new Date().toISOString(), resumo, erro: erro ?? null })
        .eq("id", execucao.id);
    }
    return resumo;
  };

  // ------------------------------------------- 2. presos no meio do envio
  const quinzeMinAtras = new Date(Date.now() - 15 * 60_000).toISOString();
  const { data: presos } = await admin
    .from("repasse_lote")
    .update({ status: "verificar", erro: "O envio foi interrompido no meio. Confira no Asaas se a transferência existe." })
    .eq("status", "enviando")
    .lt("updated_at", quinzeMinAtras)
    .select("id");
  resumo.presosParaVerificar = presos?.length ?? 0;

  // ------------------------------------------------------ 3. montar lotes
  const { data: montados, error: erroMontar } = await admin.rpc("montar_lotes_repasse", { p_data: hoje });
  if (erroMontar) return terminar(`montar lotes: ${erroMontar.message}`);
  resumo.lotesMontados = (montados as unknown[] | null)?.length ?? 0;

  // ------------------------------------------------------- 4. enviar
  const { data: preparados } = await admin
    .from("repasse_lote")
    .select("id")
    .eq("status", "preparado")
    .order("created_at");

  for (const l of (preparados ?? []) as { id: string }[]) {
    if (Date.now() > prazo) {
      resumo.interrompidaPorTempo = true;
      break;
    }
    const r = await enviarLote(admin, l.id, cfg.asaas_ambiente);
    if (r.ok) resumo.enviados.push({ nome: r.nome, valor: r.valor });
    else if (r.situacao !== "indisponivel") {
      resumo.problemas.push({ nome: r.nome ?? "lote", erro: r.erro, situacao: r.situacao });
    }
  }

  // ------------------------------------------------------- 5. avisar
  const temNovidade =
    resumo.enviados.length > 0 || resumo.problemas.length > 0 || resumo.presosParaVerificar > 0 || resumo.interrompidaPorTempo;

  if (temNovidade) {
    const total = resumo.enviados.reduce((s, e) => s + e.valor, 0);
    const linhas = [`*Trilha · repasses de ${dataBR(hoje)}*`];
    if (resumo.enviados.length) {
      linhas.push(
        "",
        `*${resumo.enviados.length} Pix aguardando SUA APROVAÇÃO no Asaas* (${brl(total)}):`,
        ...resumo.enviados.slice(0, 15).map((e) => `• ${e.nome}: ${brl(e.valor)}`),
      );
    }
    if (resumo.problemas.length) {
      linhas.push("", `*${resumo.problemas.length} com problema:*`, ...resumo.problemas.slice(0, 10).map((p) => `• ${p.nome}: ${p.erro}`));
    }
    if (resumo.presosParaVerificar) {
      linhas.push("", `*${resumo.presosParaVerificar} envio(s) interrompido(s)*: conferir no Asaas antes de reenviar.`);
    }
    if (resumo.interrompidaPorTempo) linhas.push("", "Parte ficou para a próxima execução (tempo).");
    linhas.push("", "Detalhes no painel, em Repasses.");

    // O sino sempre; o WhatsApp só se houver telefone de alerta.
    await criarAviso(admin, {
      tipo: "repasse",
      gravidade: resumo.problemas.length || resumo.presosParaVerificar ? "problema" : "atencao",
      titulo: resumo.problemas.length || resumo.presosParaVerificar ? `Repasses de ${dataBR(hoje)}: há problema` : `Repasses de ${dataBR(hoje)}: ${resumo.enviados.length} Pix aguardando aprovação no Asaas`,
      texto: linhas.slice(1).join("\n").trim(),
      link: resumo.problemas.length || resumo.presosParaVerificar ? "/repasses?aba=problema" : "/repasses?aba=aguardando",
    });

    const envio = cfg.telefone_alerta
      ? await enviarWhatsApp(cfg.telefone_alerta, linhas.join("\n"))
      : ({ ok: false, erro: "sem telefone de alerta" } as const);
    resumo.alertaEnviado = cfg.telefone_alerta ? envio.ok : null;
    if (!envio.ok && cfg.telefone_alerta) console.error("[repasse] alerta não enviado:", envio.erro);
  }

  return terminar();
}
