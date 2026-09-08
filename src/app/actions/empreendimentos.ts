"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { empreendimentoSchema } from "@/lib/schemas";
import { ehAdmin, getSessao } from "@/lib/sessao";

export type Resultado = { id: string; erro: null } | { id: null; erro: string };

/**
 * Junta a explicação amigável com o motivo técnico do banco.
 */
const detalhar = (mensagem: string, erro: { code?: string; message?: string } | null) =>
  erro?.message ? `${mensagem} (${erro.code ?? "sem código"}: ${erro.message})` : mensagem;


export async function criarEmpreendimento(bruto: unknown): Promise<Resultado> {
  const sessao = await getSessao();
  if (!sessao?.conta) {
    return { id: null, erro: "Sessão expirada. Entre de novo." };
  }

  const parsed = empreendimentoSchema.safeParse(bruto);
  if (!parsed.success) {
    return { id: null, erro: "Confira os campos destacados e tente de novo." };
  }

  const { incorporadora_id, nome, endereco } = parsed.data;

  // Incorporadora só cadastra empreendimento para si mesma — a regra também
  // existe no banco, isto aqui é para dar uma mensagem melhor.
  if (!ehAdmin(sessao) && incorporadora_id !== sessao.incorporadoraId) {
    return { id: null, erro: "Você só pode cadastrar empreendimentos da sua incorporadora." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("empreendimento")
    .insert({ incorporadora_id, nome, endereco: endereco || null })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    return { id: null, erro: detalhar("Não foi possível salvar o empreendimento.", error) };
  }

  revalidatePath("/empreendimentos");
  revalidatePath("/empreendimentos");
  return { id: data.id, erro: null };
}

export async function atualizarEmpreendimento(id: string, bruto: unknown): Promise<Resultado> {
  const sessao = await getSessao();
  if (!sessao?.conta) {
    return { id: null, erro: "Sessão expirada. Entre de novo." };
  }

  const parsed = empreendimentoSchema.safeParse(bruto);
  if (!parsed.success) {
    return { id: null, erro: "Confira os campos destacados e tente de novo." };
  }

  const { incorporadora_id, nome, endereco } = parsed.data;

  if (!ehAdmin(sessao) && incorporadora_id !== sessao.incorporadoraId) {
    return { id: null, erro: "Você só pode editar empreendimentos da sua incorporadora." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("empreendimento")
    .update({ incorporadora_id, nome, endereco: endereco || null })
    .eq("id", id);

  if (error) {
    return { id: null, erro: detalhar("Não foi possível salvar as alterações.", error) };
  }

  revalidatePath("/empreendimentos");
  revalidatePath("/empreendimentos");
  return { id, erro: null };
}
