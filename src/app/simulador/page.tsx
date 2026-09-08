import type { Metadata } from "next";
import {
  empreendimentosSimulaveis,
  simular,
  unidadesDoEmpreendimento,
  type UnidadeSimulavel,
} from "@/lib/simulador";
import CardPagamento from "@/components/card-pagamento";
import { BuscaEmpreendimento } from "./busca-empreendimento";
import { caracteristicas } from "@/lib/unidade";
import { BuscaUnidade } from "./busca-unidade";

/**
 * O simulador é a única tela do sistema que um comprador vê. Ele é público de
 * propósito: quem tem o link entra, sem conta e sem senha.
 *
 * `noindex` porque público aqui quer dizer "acessível por link", não
 * "publicado". Preço de unidade não deve virar resultado de busca do Google.
 */
export const metadata: Metadata = {
  title: "Simulador · Trilha",
  description: "Simule a entrada parcelada de uma unidade.",
  robots: { index: false, follow: false },
};

export default async function SimuladorPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; u?: string }>;
}) {
  const { e, u } = await searchParams;

  let empreendimentos;
  try {
    empreendimentos = await empreendimentosSimulaveis();
  } catch {
    return (
      <Moldura>
        <p className="rounded-md border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          O simulador está indisponível no momento. Tente de novo em alguns minutos.
        </p>
      </Moldura>
    );
  }

  const selecionado = e ? empreendimentos.find((emp) => emp.id === e) : undefined;

  // As unidades só são buscadas depois que há empreendimento — e a simulação,
  // só depois que há unidade. Nada de valor sai do servidor antes disso.
  const unidades: UnidadeSimulavel[] = selecionado
    ? await unidadesDoEmpreendimento(selecionado.id)
    : [];

  const simulacao = selecionado && u ? await simular(selecionado.id, u) : null;
  const unidadeSelecionada = simulacao?.unidade;

  return (
    <Moldura>
      <div className="flex flex-col gap-5">
        <BuscaEmpreendimento empreendimentos={empreendimentos} selecionado={selecionado} />

        {selecionado ? (
          <BuscaUnidade
            empreendimentoId={selecionado.id}
            unidades={unidades}
            selecionada={unidadeSelecionada}
          />
        ) : null}

        {selecionado && u && !simulacao ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
            Esta unidade não está mais disponível para simulação. Escolha outra ou fale com quem
            está te atendendo.
          </p>
        ) : null}

        {simulacao ? <Resultado simulacao={simulacao} /> : null}
      </div>
    </Moldura>
  );
}

function Resultado({ simulacao }: { simulacao: NonNullable<Awaited<ReturnType<typeof simular>>> }) {
  const { unidade, empreendimento, incorporadora, condicoes } = simulacao;

  if (condicoes.length === 0) {
    return (
      <p className="rounded-md border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
        As condições desta unidade estão sendo revisadas. Fale com quem está te atendendo para
        receber a simulação.
      </p>
    );
  }

  return (
    <section>
      <header className="mb-4">
        <h2 className="font-display text-xl font-semibold text-trilha-700">
          {unidade.identificacao} · {empreendimento}
        </h2>
        <p className="mt-0.5 text-sm text-trilha-400">
          {[caracteristicas(unidade), incorporadora].filter(Boolean).join(" · ")}
        </p>
      </header>

      {/* Lado a lado e com a mesma largura: nenhuma opção parece "a principal".
          Quando não cabem, a faixa rola para o lado em vez de empilhar. */}
      <div className="-mx-1 snap-x snap-mandatory overflow-x-auto px-1 pb-3">
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: `repeat(${condicoes.length}, minmax(21rem, 1fr))` }}
        >
          {condicoes.map((c) => (
            <CardPagamento key={c.ordem} condicao={c} modo="publico" />
          ))}
        </div>
      </div>

      <p className="mt-2 text-sm text-trilha-400">
        Na Trilha você se muda agora e paga a entrada em parcelas. O saldo é quitado no mês
        seguinte ao fim desse período, por financiamento bancário ou recursos próprios.
      </p>
    </section>
  );
}

/** Cabeçalho e respiro da página. É a única tela com a marca virada ao cliente. */
function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-trilha-50/40 px-5 py-10 sm:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-8">
          <p className="font-display text-sm font-semibold tracking-[0.18em] text-trilha-500 uppercase">
            Trilha
          </p>
          <h1 className="mt-1 text-3xl font-bold text-trilha-900">Simulador</h1>
          <p className="mt-2 max-w-xl text-[15px] text-trilha-400">
            Escolha o empreendimento e a unidade para ver as condições de entrada parcelada.
          </p>
        </header>

        {children}

        <footer className="mt-10 text-xs text-trilha-300">
          Valores sujeitos a confirmação. Simulação não constitui proposta nem reserva de unidade.
        </footer>
      </div>
    </main>
  );
}
