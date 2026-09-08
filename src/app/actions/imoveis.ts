"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { imovelSchema } from "@/lib/schemas";
import { parseDecimal } from "@/lib/br";
import { getSessao } from "@/lib/sessao";

export type Resultado = { id: string; erro: null } | { id: null; erro: string };

const inteiro = (v?: string) => (v && v !== "" ? Number(v) : null);

/**
 * Junta a explicação amigável com o motivo técnico do banco.
 */
const detalhar = (mensagem: string, erro: { code?: string; message?: string } | null) =>
  erro?.message ? `${mensagem} (${erro.code ?? "sem código"}: ${erro.message})` : mensagem;


/** Converte os campos do formulário para o formato da tabela. */
function montarCampos(v: import("@/lib/schemas").ImovelFormValues) {
  return {
    empreendimento_id: v.empreendimento_id,
    identificacao: v.identificacao,
    tipologia: v.tipologia || null,
    observacao: v.observacao || null,
    numero_matricula: v.numero_matricula || null,
    tipo: v.tipo,
    status: v.status,
    valor: v.valor ? parseDecimal(v.valor) : null,
    metros_quadrados: v.metros_quadrados ? parseDecimal(v.metros_quadrados) : null,
    area_total: v.area_total ? parseDecimal(v.area_total) : null,
    area_garden: v.area_garden ? parseDecimal(v.area_garden) : null,
    posicao_solar: v.posicao_solar || null,
    num_quartos: inteiro(v.num_quartos),
    num_suites: inteiro(v.num_suites),
    num_banheiros: inteiro(v.num_banheiros),
    num_vagas: inteiro(v.num_vagas),
    matricula_vaga: v.matricula_vaga || null,
    sacada: v.sacada,
    churrasqueira: v.churrasqueira,
  };
}

export async function criarImovel(bruto: unknown): Promise<Resultado> {
  const sessao = await getSessao();
  if (!sessao?.conta) {
    return { id: null, erro: "Sessão expirada. Entre de novo." };
  }

  const parsed = imovelSchema.safeParse(bruto);
  if (!parsed.success) {
    return { id: null, erro: "Confira os campos destacados e tente de novo." };
  }

  const v = parsed.data;
  const supabase = await createClient();

  // As regras de acesso no banco já impedem gravar num empreendimento de
  // outra incorporadora — o insert simplesmente falha.
  const { data, error } = await supabase
    .from("imovel")
    .insert(montarCampos(v))
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    if (error?.code === "23505") {
      return {
        id: null,
        erro: `Já existe um imóvel com a identificação "${v.identificacao}" nesse empreendimento.`,
      };
    }
    if (error?.code === "42501") {
      return { id: null, erro: "Você não tem permissão para cadastrar nesse empreendimento." };
    }
    return { id: null, erro: detalhar("Não foi possível salvar o imóvel.", error) };
  }

  revalidatePath("/empreendimentos");
  return { id: data.id, erro: null };
}

export async function atualizarImovel(id: string, bruto: unknown): Promise<Resultado> {
  const sessao = await getSessao();
  if (!sessao?.conta) {
    return { id: null, erro: "Sessão expirada. Entre de novo." };
  }

  const parsed = imovelSchema.safeParse(bruto);
  if (!parsed.success) {
    return { id: null, erro: "Confira os campos destacados e tente de novo." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("imovel").update(montarCampos(parsed.data)).eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return {
        id: null,
        erro: `Já existe outro imóvel com a identificação "${parsed.data.identificacao}" nesse empreendimento.`,
      };
    }
    if (error.code === "42501") {
      return { id: null, erro: "Você não tem permissão para editar esse imóvel." };
    }
    return { id: null, erro: detalhar("Não foi possível salvar as alterações.", error) };
  }

  revalidatePath("/empreendimentos");
  return { id, erro: null };
}
