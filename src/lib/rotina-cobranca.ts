/**
 * A rotina diária de cobrança.
 *
 * Chamada pela Vercel todo dia às 6h (ver `vercel.json` e
 * `app/api/cron/financeiro`). Fora de `app/actions` de propósito: não confere
 * quem chama — quem chama é a rota, que confere o segredo da Vercel.
 *
 * O que faz, em ordem:
 *   1. interruptor geral desligado → registra e para;
 *   2. pede ao banco a lista do que cobrar hoje (`parcelas_para_cobrar`);
 *   3. cobra uma por uma, pela MESMA regra do botão (`cobrarParcela`) — as
 *      travas são as mesmas, e cobrança repetida é impossível;
 *   4. lista as parcelas vencidas sem cobrança (viram alerta, não cobrança);
 *   5. grava o resumo em `rotina_execucao`;
 *   6. se algo precisa de gente, manda UM WhatsApp para o telefone de alerta.
 *
 * Para caber no tempo de uma execução (60s), para de cobrar perto dos 35s (deixa tempo para o repasse). O
 * que sobrar fica para o dia seguinte — ainda dentro do prazo, porque a
 * geração é no dia 1 e o vencimento no dia 10.
 */

import type { createAdminClient } from "@/lib/supabase/admin";
import { cobrarParcela } from "@/lib/cobranca";
import { enviarWhatsApp } from "@/lib/notificacoes";
import { criarAviso } from "@/lib/avisos";

type Admin = ReturnType<typeof createAdminClient>;

const LIMITE_MS = 35_000;

export type ResumoCobranca = {
  data: string;
  ligada: boolean;
  candidatas: number;
  geradas: number;
  falhas: { parcelaId: string; numero: number; erro: string }[];
  vencidasSemCobranca: { numero: number; unidade: string; vencimento: string }[];
  interrompidaPorTempo: boolean;
  alertaEnviado: boolean | null;
};

const dataBR = (iso: string) => {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
};

export async function rodarCobranca(admin: Admin, hoje: string): Promise<ResumoCobranca> {
  const inicio = Date.now();

  const { data: execucao } = await admin
    .from("rotina_execucao")
    .insert({ rotina: "cobranca", data_ref: hoje })
    .select("id")
    .maybeSingle<{ id: string }>();

  const resumo: ResumoCobranca = {
    data: hoje,
    ligada: false,
    candidatas: 0,
    geradas: 0,
    falhas: [],
    vencidasSemCobranca: [],
    interrompidaPorTempo: false,
    alertaEnviado: null,
  };

  const terminar = async (erro?: string) => {
    if (execucao) {
      await admin
        .from("rotina_execucao")
        .update({ terminou_em: new Date().toISOString(), resumo, erro: erro ?? null })
        .eq("id", execucao.id);
    }
    return resumo;
  };

  const { data: cfg } = await admin
    .from("config_financeiro")
    .select("cobranca_ligada, telefone_alerta")
    .maybeSingle<{ cobranca_ligada: boolean; telefone_alerta: string | null }>();

  if (!cfg) return terminar("config_financeiro não encontrada");
  resumo.ligada = cfg.cobranca_ligada;
  if (!cfg.cobranca_ligada) return terminar();

  // ------------------------------------------------------------- cobrar
  const { data: lista, error } = await admin.rpc("parcelas_para_cobrar", { p_hoje: hoje });
  if (error) return terminar(`lista de cobrança: ${error.message}`);

  const candidatas = (lista ?? []) as { parcela_id: string; numero: number }[];
  resumo.candidatas = candidatas.length;

  for (const c of candidatas) {
    if (Date.now() - inicio > LIMITE_MS) {
      resumo.interrompidaPorTempo = true;
      break;
    }
    const r = await cobrarParcela(admin, c.parcela_id);
    if (r.ok) resumo.geradas += 1;
    else resumo.falhas.push({ parcelaId: c.parcela_id, numero: c.numero, erro: r.erro });
  }

  // --------------------------------------------- vencidas sem cobrança
  const { data: vencidas } = await admin.rpc("parcelas_vencidas_sem_cobranca", { p_hoje: hoje });
  resumo.vencidasSemCobranca = ((vencidas ?? []) as { numero: number; unidade: string; vencimento: string }[]).map(
    (v) => ({ numero: v.numero, unidade: v.unidade, vencimento: v.vencimento }),
  );

  // ------------------------------------------------------------ alertar
  const precisaDeGente =
    resumo.falhas.length > 0 || resumo.vencidasSemCobranca.length > 0 || resumo.interrompidaPorTempo;

  if (precisaDeGente) {
    const linhas = [`*Trilha · rotina de cobrança de ${dataBR(hoje)}*`, `Geradas: ${resumo.geradas} de ${resumo.candidatas}.`];
    if (resumo.falhas.length) {
      linhas.push("", `*${resumo.falhas.length} falharam:*`);
      for (const f of resumo.falhas.slice(0, 10)) linhas.push(`• parcela ${f.numero}: ${f.erro}`);
    }
    if (resumo.vencidasSemCobranca.length) {
      linhas.push("", `*${resumo.vencidasSemCobranca.length} venceram sem cobrança:*`);
      for (const v of resumo.vencidasSemCobranca.slice(0, 10)) {
        linhas.push(`• ${v.unidade}, parcela ${v.numero}, venceu ${dataBR(v.vencimento)}`);
      }
    }
    if (resumo.interrompidaPorTempo) linhas.push("", "Parte ficou para amanhã (tempo de execução).");
    linhas.push("", "Confira no painel, na tela da trilha.");

    // O sino sempre; o WhatsApp só se houver telefone de alerta.
    await criarAviso(admin, {
      tipo: "cobranca",
      gravidade: "problema",
      titulo: `Rotina de cobrança de ${dataBR(hoje)}: precisa de atenção`,
      texto: linhas.slice(1).join("\n").trim(),
      link: "/trilhas",
    });

    const envio = cfg.telefone_alerta
      ? await enviarWhatsApp(cfg.telefone_alerta, linhas.join("\n"))
      : ({ ok: false, erro: "sem telefone de alerta" } as const);
    resumo.alertaEnviado = cfg.telefone_alerta ? envio.ok : null;
    if (!envio.ok && cfg.telefone_alerta) console.error("[rotina] alerta não enviado:", envio.erro);
  }

  return terminar();
}
