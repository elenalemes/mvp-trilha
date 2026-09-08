import type { SupabaseClient } from "@supabase/supabase-js";

export type LinhaImportacao = {
  id: string;
  ordem: number;
  identificacao: string | null;
  tipologia: string | null;
  valor: number | null;
  num_quartos: number | null;
  num_suites: number | null;
  num_banheiros: number | null;
  num_vagas: number | null;
  metros_quadrados: number | null;
  area_total: number | null;
  area_garden: number | null;
  posicao_solar: string | null;
  numero_matricula: string | null;
  matricula_vaga: string | null;
  observacao: string | null;
  origem: string | null;
  alertas: string[];
  incluir: boolean;
};

export type ImovelExistente = {
  id: string;
  identificacao: string;
  status: string;
  valor: number | null;
};

export type ItemPlano = {
  linha: LinhaImportacao;
  acao: "criar" | "atualizar" | "ignorar";
  existente?: ImovelExistente;
  /** Só em "atualizar": o valor muda? */
  valorAntigo?: number | null;
};

export type Plano = {
  itens: ItemPlano[];
  /** Unidades disponíveis no sistema que não vieram no arquivo. */
  desaparecidas: ImovelExistente[];
  resumo: { criar: number; atualizar: number; ignorar: number; indisponibilizar: number };
};

const chave = (s: string | null) => (s ?? "").trim().toLowerCase();

/**
 * Compara o que veio no arquivo com o que já existe no empreendimento e diz o
 * que vai acontecer se a importação for aplicada.
 *
 * Regra única: **a importação só toca em unidades com status "disponivel"**.
 * Qualquer outro status significa que alguém está trabalhando naquela unidade —
 * um negócio em andamento não pode ser alterado por causa de uma planilha.
 */
export async function calcularPlano(
  supabase: SupabaseClient,
  empreendimentoId: string,
  linhas: LinhaImportacao[],
): Promise<Plano> {
  const { data } = await supabase
    .from("imovel")
    .select("id, identificacao, status, valor")
    .eq("empreendimento_id", empreendimentoId)
    .returns<ImovelExistente[]>();

  const existentes = data ?? [];
  const porIdentificacao = new Map(existentes.map((i) => [chave(i.identificacao), i]));

  const itens: ItemPlano[] = linhas.map((linha) => {
    const existente = porIdentificacao.get(chave(linha.identificacao));

    if (!existente) return { linha, acao: "criar" as const };

    if (existente.status !== "disponivel") {
      return { linha, acao: "ignorar" as const, existente };
    }

    return { linha, acao: "atualizar" as const, existente, valorAntigo: existente.valor };
  });

  const noArquivo = new Set(linhas.filter((l) => l.incluir).map((l) => chave(l.identificacao)));

  const desaparecidas = existentes.filter(
    (i) => i.status === "disponivel" && !noArquivo.has(chave(i.identificacao)),
  );

  const incluidos = itens.filter((i) => i.linha.incluir);

  return {
    itens,
    desaparecidas,
    resumo: {
      criar: incluidos.filter((i) => i.acao === "criar").length,
      atualizar: incluidos.filter((i) => i.acao === "atualizar").length,
      ignorar: incluidos.filter((i) => i.acao === "ignorar").length,
      indisponibilizar: desaparecidas.length,
    },
  };
}
