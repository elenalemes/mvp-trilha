import type { OpcaoPagamento } from "@/lib/pagamento";

const pct = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

/**
 * As opções de uma incorporadora em forma de resumo, sem nenhum valor em
 * reais — os números só existem diante de um imóvel. Serve tanto para a
 * ficha que o admin vê quanto para o perfil da própria incorporadora.
 */
export default function ListaOpcoes({
  opcoes,
  percentualComissao,
}: {
  opcoes: OpcaoPagamento[];
  /** Quando vier, aparece embaixo: é da incorporadora, não de cada opção. */
  percentualComissao?: number;
}) {
  const rodape =
    percentualComissao === undefined ? null : (
      <p className="mt-4 text-sm text-trilha-400">
        Comissão do parceiro imobiliário:{" "}
        <strong className="text-trilha-700">{pct(percentualComissao)}</strong> do valor do imóvel,
        paga durante a Trilha e descontada do que a incorporadora recebe.
      </p>
    );

  // Mesmo sem nenhuma opção o rodapé aparece: a comissão é da incorporadora e
  // vale de qualquer jeito — some-la aqui esconderia justamente de quem ainda
  // está montando as condições.
  if (opcoes.length === 0) {
    return (
      <>
        <p className="text-[15px] text-trilha-400">
          Nenhuma opção cadastrada. Os imóveis desta incorporadora aparecem sem formatos de
          pagamento até que alguma seja definida — o cadastro de unidades segue liberado.
        </p>
        {rodape}
      </>
    );
  }

  return (
    <>
    <ul className="flex flex-col gap-3">
      {opcoes.map((o) => (
        <li
          key={o.ordem}
          className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-trilha-100 pb-3 last:border-0 last:pb-0"
        >
          <span className="font-display text-[15px] font-semibold text-trilha-700">
            Opção {o.ordem}
          </span>
          <span className="text-[15px] text-trilha-900">
            Entrada total {pct(o.percentual_entrada)}
          </span>
          <span className="text-sm text-trilha-400">
            {pct(o.percentual_ato)} no ato, {pct(o.percentual_entrada - o.percentual_ato)} parcelado
            em {o.prazo_meses} meses · a financiar {pct(100 - o.percentual_entrada)}
          </span>
        </li>
      ))}
    </ul>
    {rodape}
    </>
  );
}
