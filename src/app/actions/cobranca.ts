"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { ehAdmin, getSessao } from "@/lib/sessao";
import { cobrarParcela, type ResultadoCobranca } from "@/lib/cobranca";

/**
 * A cobrança no painel — as portas. Cada uma confere que é a Trilha antes de
 * qualquer coisa; a regra de cobrar mora em `lib/cobranca.ts`.
 */

export type Resultado = { ok: true } | { ok: false; erro: string };

// --------------------------------------------------------- o que a tela chama

async function exigirAdmin(): Promise<string | null> {
  const sessao = await getSessao();
  return ehAdmin(sessao) ? null : "Só a Trilha opera cobranças.";
}

/** Botão "Gerar cobrança" de uma parcela. */
export async function gerarCobranca(parcelaId: string, negocioId: string): Promise<ResultadoCobranca> {
  const recusa = await exigirAdmin();
  if (recusa) return { ok: false, erro: recusa };

  const r = await cobrarParcela(createAdminClient(), parcelaId);
  revalidatePath(`/trilhas/${negocioId}`);
  return r;
}

/** Vencimento da 1ª parcela: no ato, ou no próximo dia 10. Refaz todas as datas. */
export async function definirPrimeiroVencimento(negocioId: string, data: string): Promise<Resultado> {
  const recusa = await exigirAdmin();
  if (recusa) return { ok: false, erro: recusa };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { ok: false, erro: "Data inválida." };

  // Pelo cliente da SESSÃO: a função do banco confere de novo que é a Trilha,
  // e recusa se alguma parcela já foi cobrada ou paga.
  const supabase = await createClient();
  const { error } = await supabase.rpc("definir_primeiro_vencimento", {
    p_negocio: negocioId,
    p_data: data,
  });

  if (error) {
    if (error.code === "22023" || error.code === "42501") return { ok: false, erro: error.message };
    console.error("[cobranca] primeiro vencimento:", error);
    return { ok: false, erro: "Não consegui alterar as datas." };
  }

  revalidatePath(`/trilhas/${negocioId}`);
  return { ok: true };
}

/** Liberar (ou não) a trilha para cobrança automática. */
export async function alternarCobrancaAutomatica(negocioId: string, ligar: boolean): Promise<Resultado> {
  const recusa = await exigirAdmin();
  if (recusa) return { ok: false, erro: recusa };

  const { error } = await createAdminClient()
    .from("negocio")
    .update({ cobranca_automatica: ligar })
    .eq("id", negocioId);

  if (error) {
    console.error("[cobranca] liberar trilha:", error);
    return { ok: false, erro: "Não consegui salvar." };
  }

  revalidatePath(`/trilhas/${negocioId}`);
  return { ok: true };
}
