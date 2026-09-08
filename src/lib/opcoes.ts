/**
 * De onde vêm as condições de pagamento de um empreendimento.
 *
 * A incorporadora define um padrão que vale para tudo. Um empreendimento pode
 * ter as suas próprias — e aí elas substituem o padrão INTEIRO, nunca se
 * misturam com ele. Tudo ou nada, porque uma lista meio herdada e meio própria
 * seria impossível de explicar ao corretor e pior ainda de conferir.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OpcaoPagamento } from "@/lib/pagamento";

/**
 * Qualquer cliente Supabase serve. A resolução da herança é a mesma para a
 * sessão do painel e para a leitura do simulador público — o que muda é quem
 * está perguntando, e isso as policies (ou a ausência delas) já resolvem.
 */
type Supabase = SupabaseClient;

export type Origem = "empreendimento" | "incorporadora" | "nenhuma";

export type OpcoesResolvidas = {
  opcoes: OpcaoPagamento[];
  origem: Origem;
};

type Linha = OpcaoPagamento & { empreendimento_id: string | null };

export const CAMPOS_OPCAO = "ordem, percentual_entrada, percentual_ato, prazo_meses";

/**
 * Uma consulta só traz os dois níveis; a escolha acontece aqui. Duas idas ao
 * banco seriam mais legíveis e mais lentas em toda ficha de imóvel.
 */
export async function opcoesQueValem(
  supabase: Supabase,
  incorporadoraId: string,
  empreendimentoId: string,
): Promise<OpcoesResolvidas> {
  const { data } = await supabase
    .from("opcao_pagamento")
    .select(`${CAMPOS_OPCAO}, empreendimento_id`)
    .eq("incorporadora_id", incorporadoraId)
    .or(`empreendimento_id.eq.${empreendimentoId},empreendimento_id.is.null`)
    .order("ordem")
    .returns<Linha[]>();

  const linhas = data ?? [];
  const proprias = linhas.filter((l) => l.empreendimento_id === empreendimentoId);
  if (proprias.length) return { opcoes: proprias, origem: "empreendimento" };

  const padrao = linhas.filter((l) => l.empreendimento_id === null);
  return { opcoes: padrao, origem: padrao.length ? "incorporadora" : "nenhuma" };
}

/** Só as condições próprias do empreendimento, sem cair no padrão. */
export async function opcoesProprias(
  supabase: Supabase,
  empreendimentoId: string,
): Promise<OpcaoPagamento[]> {
  const { data } = await supabase
    .from("opcao_pagamento")
    .select(CAMPOS_OPCAO)
    .eq("empreendimento_id", empreendimentoId)
    .order("ordem")
    .returns<OpcaoPagamento[]>();
  return data ?? [];
}

/** Só o padrão da incorporadora. */
export async function opcoesPadrao(
  supabase: Supabase,
  incorporadoraId: string,
): Promise<OpcaoPagamento[]> {
  const { data } = await supabase
    .from("opcao_pagamento")
    .select(CAMPOS_OPCAO)
    .eq("incorporadora_id", incorporadoraId)
    .is("empreendimento_id", null)
    .order("ordem")
    .returns<OpcaoPagamento[]>();
  return data ?? [];
}
