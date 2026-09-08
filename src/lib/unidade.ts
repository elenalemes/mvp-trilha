/**
 * Como se descreve uma unidade em uma linha.
 *
 * Mora aqui, e não dentro de um componente, porque os dois lados da fronteira
 * usam: o servidor monta o cabeçalho do resultado e o cliente monta cada linha
 * da lista de busca. Função exportada de arquivo com "use client" não pode ser
 * chamada do servidor — e isso o TypeScript não avisa.
 */

export type UnidadeResumo = {
  tipologia: string | null;
  metros_quadrados: number | null;
  num_quartos: number | null;
  num_suites: number | null;
  num_vagas: number | null;
};

/** Ex.: "Studio · 1 dorm. · 1 vaga · 28,00 m²". Vazio quando não há nada a dizer. */
export function caracteristicas(u: UnidadeResumo): string {
  return [
    u.tipologia,
    u.num_quartos ? `${u.num_quartos} dorm.` : null,
    u.num_suites ? `${u.num_suites} suíte${u.num_suites > 1 ? "s" : ""}` : null,
    u.num_vagas ? `${u.num_vagas} vaga${u.num_vagas > 1 ? "s" : ""}` : null,
    u.metros_quadrados
      ? `${Number(u.metros_quadrados).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} m²`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
