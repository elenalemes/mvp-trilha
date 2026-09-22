import type { Metadata } from "next";
import Link from "next/link";
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
import Compartilhar from "./compartilhar";

/**
 * O simulador é a única tela do sistema que um comprador vê. Ele é público de
 * propósito: quem tem o link entra, sem conta e sem senha.
 *
 * `noindex` porque público aqui quer dizer "acessível por link", não
 * "publicado". Preço de unidade não deve virar resultado de busca do Google.
 */
/**
 * Nunca gerar esta página no build. Ela lê o banco com a chave de servidor, e
 * durante o build essa chave pode não existir — o deploy quebraria por um
 * motivo que não tem nada a ver com o código. Além disso o conteúdo muda a
 * cada consulta: uma versão estática mostraria estoque velho.
 */
export const dynamic = "force-dynamic";

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
        {/* As duas buscas ficam sempre visíveis e sempre editáveis, lado a lado.
            Trocar de unidade ou de empreendimento é digitar por cima — por isso
            não existe "voltar" nesta tela: nunca se saiu de lugar nenhum. */}
        <div className="grid grid-cols-1 gap-4 rounded-lg border border-trilha-200 bg-white p-5 sm:grid-cols-2">
          <BuscaEmpreendimento empreendimentos={empreendimentos} selecionado={selecionado} />
          <BuscaUnidade
            empreendimentoId={selecionado?.id}
            unidades={unidades}
            selecionada={unidadeSelecionada}
          />
        </div>

        {selecionado && u && !simulacao ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
            Esta unidade não está mais disponível para simulação. Escolha outra ou fale com quem
            está te atendendo.
          </p>
        ) : null}

        {simulacao && selecionado ? (
          <Resultado simulacao={simulacao} empreendimentoId={selecionado.id} />
        ) : null}
      </div>
    </Moldura>
  );
}

function Resultado({
  simulacao,
  empreendimentoId,
}: {
  simulacao: NonNullable<Awaited<ReturnType<typeof simular>>>;
  empreendimentoId: string;
}) {
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
          style={{ gridTemplateColumns: `repeat(${condicoes.length}, minmax(20rem, 1fr))` }}
        >
          {/* O botão fica DENTRO da coluna do card, e não num lugar comum
              embaixo: a proposta é sempre de uma condição, e separar o "enviar"
              do número que ele escolheu é como se manda a opção errada.
              `grid-rows-[1fr_auto]` estica os cards à mesma altura para os
              botões ficarem alinhados entre si. */}
          {condicoes.map((c) => (
            <div key={c.ordem} className="grid snap-start grid-rows-[1fr_auto] gap-3">
              <CardPagamento condicao={c} modo="publico" />
              <Link
                href={`/simulador/proposta?e=${empreendimentoId}&u=${unidade.id}&c=${c.ordem}`}
                className="font-display rounded-md bg-trilha-500 px-4 py-2.5 text-center text-[15px] font-semibold tracking-wide text-white transition-colors hover:bg-trilha-700"
              >
                Enviar proposta
              </Link>
            </div>
          ))}
        </div>
      </div>

      {/* No celular só um card cabe na tela, e nada indica que há outros. */}
      {condicoes.length > 1 ? (
        <p className="text-sm text-trilha-400 sm:hidden">
          {condicoes.length} condições — deslize para o lado para ver as outras.
        </p>
      ) : null}

      <Compartilhar
        empreendimentoId={empreendimentoId}
        unidadeId={unidade.id}
        unidade={unidade.identificacao}
        empreendimento={empreendimento}
      />
    </section>
  );
}

/** Cabeçalho e respiro da página. É a única tela com a marca virada ao cliente. */
function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-trilha-50/40 px-5 py-10 sm:px-8">
      <div className="mx-auto w-full max-w-4xl">
        <header className="mb-8">
          <p className="font-display text-sm font-semibold tracking-[0.18em] text-trilha-500 uppercase">
            Trilha
          </p>
          <h1 className="mt-1 text-3xl font-bold text-trilha-900">Simulador</h1>
          <p className="mt-2 max-w-xl text-[15px] text-trilha-400">
            Condições de pagamento por unidade.
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
