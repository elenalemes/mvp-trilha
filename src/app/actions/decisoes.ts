"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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

  const { error } = await supabase.rpc("aceitar_proposta", {
    p_proposta: id,
    p_motivo: motivo?.trim() || null,
  });

  if (error) return { ok: false, erro: traduzir(error) };

  revalidar(id);
  return { ok: true };
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
