"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessao } from "@/lib/sessao";

/**
 * A conciliação das parcelas.
 *
 * Só a Trilha marca — e quem garante isso é a policy `parcela_admin`, a única
 * de escrita na tabela. Estas actions usam o cliente da SESSÃO justamente para
 * que a incorporadora e o corretor, que leem as parcelas, esbarrem no banco se
 * chamarem isto direto.
 *
 * Quando o Asaas entrar, é aqui que ele pluga: o webhook chama a mesma escrita
 * e a tabela não muda.
 */

export type ResultadoParcela = { ok: true } | { ok: false; erro: string };

function falhou(error: { code?: string; message?: string } | null): string {
  if (error?.code === "23514" && error.message) return error.message;
  if (error?.code === "42501" || error?.code === "PGRST116") {
    return "Só a Trilha registra pagamento de parcela.";
  }
  console.error("[parcela] escrita recusada:", error);
  return "Não consegui salvar. Tente de novo em instantes.";
}

/** Registrar o pagamento de uma parcela. */
export async function marcarPaga(parcelaId: string, negocioId: string): Promise<ResultadoParcela> {
  const sessao = await getSessao();
  const supabase = await createClient();

  const { data: linha, error } = await supabase
    .from("parcela")
    .update({
      status: "paga",
      pago_em: new Date().toISOString(),
      pago_por: sessao?.usuarioId ?? null,
    })
    .eq("id", parcelaId)
    .select("id")
    .maybeSingle<{ id: string }>();

  // Sem erro e sem linha = a policy filtrou. Para o banco a parcela não existe
  // para quem pediu, e é assim que deve ser.
  if (error || !linha) return { ok: false, erro: falhou(error) };

  revalidatePath(`/trilhas/${negocioId}`);
  revalidatePath("/trilhas");
  return { ok: true };
}

/** Desfazer. Marcar errado acontece, e sem volta ninguém marca. */
export async function desmarcarPaga(
  parcelaId: string,
  negocioId: string,
): Promise<ResultadoParcela> {
  const supabase = await createClient();

  const { data: linha, error } = await supabase
    .from("parcela")
    // A data sai junto: o `check` do banco amarra as duas.
    .update({ status: "aberta", pago_em: null, pago_por: null })
    .eq("id", parcelaId)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error || !linha) return { ok: false, erro: falhou(error) };

  revalidatePath(`/trilhas/${negocioId}`);
  revalidatePath("/trilhas");
  return { ok: true };
}
