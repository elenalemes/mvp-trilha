import { formatBRL } from "@/lib/br";
import type { Condicao } from "@/lib/pagamento";

const pct = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

function Linha({
  termo,
  valor,
  nota,
  forte,
}: {
  termo: string;
  valor: string;
  nota?: string;
  forte?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
      <dt className="text-sm text-trilha-400">
        {termo}
        {nota ? <span className="ml-1 text-trilha-300">{nota}</span> : null}
      </dt>
      <dd
        className={`ml-auto text-[15px] whitespace-nowrap tabular-nums ${forte ? "font-semibold text-trilha-700" : "text-trilha-900"}`}
      >
        {valor}
      </dd>
    </div>
  );
}

/**
 * Uma condição de pagamento em números.
 *
 * O card é organizado por **quando o dinheiro sai** — no ato, durante a
 * Trilha, e no saldo. É a pergunta que o corretor precisa responder de cabeça
 * no atendimento ("quanto agora, quanto por mês, quanto depois"), e responder
 * isso sem ele fazer conta é a função inteira desta tela.
 *
 * O título é o PRAZO, não "Opção 1". O corretor diz ao cliente "na de 24
 * meses" — número de opção é vocabulário de cadastro, não de conversa. No modo
 * completo o "Opção N" continua aparecendo pequeno, porque ali ele liga o card
 * ao formulário onde a condição é editada.
 *
 * O modo muda o que aparece embaixo, e isso é regra de negócio, não estilo:
 *
 *   completo — Trilha e incorporadora. Veem a divisão inteira da parcela.
 *   parceiro — corretor e imobiliária. Veem a própria comissão, recolhida.
 *   publico  — o simulador. Nada: nem divisão, nem comissão.
 */
export default function CardPagamento({
  condicao: c,
  modo = "completo",
}: {
  condicao: Condicao;
  modo?: "completo" | "parceiro" | "publico";
}) {
  // O saldo é quitado no mês seguinte ao fim da Trilha: 25º numa opção de 24
  // meses, 13º numa de 12. Fixar "25" quebraria em todo prazo diferente.
  const mesDoSaldo = c.prazoMeses + 1;

  return (
    <article className="flex snap-start flex-col rounded-lg border border-trilha-200 bg-white p-7 shadow-[0_1px_2px_rgba(21,38,110,0.05)]">
      <header className="border-b border-trilha-100 pb-4">
        {modo === "completo" ? (
          <p className="font-display mb-1 text-xs font-semibold tracking-[0.12em] text-trilha-300 uppercase">
            Opção {c.ordem}
          </p>
        ) : null}
        <h3 className="font-display text-2xl font-bold text-trilha-900">{c.prazoMeses} meses</h3>
        <p className="mt-0.5 text-sm text-trilha-400">de Trilha</p>
      </header>

      {/* O número que decide a conversa. */}
      <div className="py-5">
        <p className="font-display text-3xl font-bold text-trilha-900">
          {c.prazoMeses}× {formatBRL(c.parcela)}
        </p>
        <p className="mt-1 text-sm text-trilha-400">parcela mensal, com a Gestão do negócio</p>
      </div>

      {/* Os três momentos, na ordem em que o dinheiro sai. */}
      <dl className="flex flex-col gap-2.5 border-t border-trilha-100 pt-4">
        <Linha termo="No ato" nota={`(${pct(c.percentualAto)})`} valor={formatBRL(c.ato)} />
        <Linha
          termo={`Durante ${c.prazoMeses} meses`}
          valor={`${c.prazoMeses}× ${formatBRL(c.parcela)}`}
        />
        <Linha
          termo="No saldo"
          nota={`(${mesDoSaldo}º mês · ${pct(100 - c.percentualEntrada)})`}
          valor={formatBRL(c.saldoFinanciar)}
          forte
        />
      </dl>

      <dl className="mt-4 flex flex-1 flex-col gap-2.5 border-t border-trilha-100 pt-4">
        <Linha
          termo="Entrada total"
          nota={`(${pct(c.percentualEntrada)})`}
          valor={formatBRL(c.entrada)}
        />
        <Linha termo="Valor final do imóvel" valor={formatBRL(c.base)} forte />
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
