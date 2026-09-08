import { formatBRL } from "@/lib/br";
import type { Condicao } from "@/lib/pagamento";

const pct = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

function Linha({
  termo,
  valor,
  forte,
}: {
  termo: string;
  valor: string;
  forte?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
      <dt className="text-sm text-trilha-400">{termo}</dt>
      <dd
        className={`ml-auto text-[15px] whitespace-nowrap tabular-nums ${forte ? "font-semibold text-trilha-700" : "text-trilha-900"}`}
      >
        {valor}
      </dd>
    </div>
  );
}

/**
 * Um formato de pagamento em números, para o imóvel que está sendo olhado.
 *
 * Não é selecionável nem editável de propósito: mudar a condição é editar a
 * opção da incorporadora, e aí todos os imóveis dela mudam junto.
 *
 * O modo muda O QUE aparece embaixo da parcela, e isso é regra de negócio,
 * não estilo:
 *
 *   completo — Trilha e incorporadora. Veem a divisão inteira da parcela.
 *   parceiro — corretor e imobiliária. Veem a parcela do comprador e, só se
 *              clicarem, a própria comissão. O que a incorporadora recebe
 *              nunca aparece, e a comissão fica recolhida porque esta é a
 *              tela que o corretor mostra ao cliente.
 *   publico  — o comprador, no simulador. Vê o que vai pagar e mais nada:
 *              nem divisão, nem comissão, nem quem recebe o quê.
 */
export default function CardPagamento({
  condicao: c,
  modo = "completo",
}: {
  condicao: Condicao;
  modo?: "completo" | "parceiro" | "publico";
}) {
  return (
    <article className="flex snap-start flex-col rounded-lg border border-trilha-200 bg-white p-6 shadow-[0_1px_2px_rgba(21,38,110,0.05)]">
      <header className="flex items-baseline justify-between gap-3 border-b border-trilha-100 pb-3">
        <h3 className="font-display text-lg font-semibold text-trilha-700">Opção {c.ordem}</h3>
        <span className="font-display text-xs font-semibold tracking-[0.12em] text-trilha-400 uppercase">
          {c.prazoMeses} meses de Trilha
        </span>
      </header>

      {/* O número que a pessoa quer saber primeiro. */}
      <div className="py-4">
        <p className="font-display text-2xl font-bold text-trilha-900">
          {c.prazoMeses}× {formatBRL(c.parcela)}
        </p>
        <p className="mt-1 text-sm text-trilha-400">
          parcela mensal, contando com a Gestão do negócio.
        </p>
      </div>

      <dl className="flex flex-1 flex-col gap-2 border-t border-trilha-100 pt-4">
        <Linha termo="Valor final do imóvel" valor={formatBRL(c.base)} forte />
        <Linha termo={`Entrada total (${pct(c.percentualEntrada)})`} valor={formatBRL(c.entrada)} />
        <Linha termo={`Ato (${pct(c.percentualAto)})`} valor={formatBRL(c.ato)} />
        <Linha termo="A financiar no fim" valor={formatBRL(c.saldoFinanciar)} forte />
      </dl>

      {modo === "publico" ? null : modo === "parceiro" ? (
        /* Recolhido de propósito: o corretor abre esta ficha na frente do
           cliente. A comissão está a um clique, mas não na tela por padrão. */
        <details className="mt-4 border-t border-trilha-100 pt-4">
          <summary className="font-display cursor-pointer list-none text-xs font-semibold tracking-[0.12em] text-trilha-400 uppercase underline underline-offset-2 hover:text-trilha-700">
            Ver minha comissão
          </summary>

          {c.comissaoCabe ? (
            <dl className="mt-3 flex flex-col gap-2">
              <Linha
                termo={`Comissão (${pct(c.percentualComissao)})`}
                valor={`${c.prazoMeses}× ${formatBRL(c.comissaoMensal)}`}
                forte
              />
              <Linha termo="Total ao fim da Trilha" valor={formatBRL(c.comissaoTotal)} />
            </dl>
          ) : (
            <p className="mt-3 text-sm text-red-700">
              Esta condição não fecha com a comissão atual. Fale com a incorporadora antes de
              oferecê-la ao cliente.
            </p>
          )}

          <p className="mt-3 text-xs text-trilha-400">
            Paga ao longo dos {c.prazoMeses} meses de Trilha. Sai de dentro da entrada — não é um
            valor a mais na parcela do comprador.
          </p>
        </details>
      ) : (
        /* O comprador só vê a parcela cheia. Esta parte é para quem precisa
           saber quanto sobra: a incorporadora e a Trilha. */
        <div className="mt-4 border-t border-trilha-100 pt-4">
          <h4 className="font-display mb-2.5 text-xs font-semibold tracking-[0.12em] text-trilha-400 uppercase">
            Como a parcela se divide
          </h4>

          {c.comissaoCabe ? (
            <dl className="flex flex-col gap-2">
              <Linha
                termo="Incorporadora"
                valor={`${c.prazoMeses}× ${formatBRL(c.incorporadoraMensal)}`}
                forte
              />
              <Linha
                termo={`Parceiro imobiliário (${pct(c.percentualComissao)})`}
                valor={`${c.prazoMeses}× ${formatBRL(c.comissaoMensal)}`}
              />
              <Linha termo="Gestão Trilha" valor={`${c.prazoMeses}× ${formatBRL(c.gestao)}`} />
            </dl>
          ) : (
            <p className="text-sm text-red-700">
              A comissão de {pct(c.percentualComissao)} ({formatBRL(c.comissaoTotal)}) é maior que o
              que se paga parcelado nesta opção ({formatBRL(c.totalNaTrilha)}). Do jeito que está, a
              incorporadora receberia menos que zero durante a Trilha.
            </p>
          )}

          <p className="mt-3 text-xs text-trilha-400">
            A incorporadora recebe {formatBRL(c.incorporadoraNaTrilha)} durante a Trilha
            {c.ato > 0 ? ` (já contando os ${formatBRL(c.ato)} do ato)` : ""} e{" "}
            {formatBRL(c.saldoFinanciar)} no saldo — {formatBRL(c.incorporadoraTotal)} no total. A
            comissão é quitada inteira durante a Trilha; o saldo do fim não tem desconto.
          </p>
        </div>
      )}
    </article>
  );
}
