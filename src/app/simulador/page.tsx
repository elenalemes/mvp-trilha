import { AvisoPublico, MolduraPublica } from "@/components/publico";
import { buttonVariants } from "@/components/shadcn/button";
import { cn } from "@/lib/utils";
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
        <AvisoPublico>
          O simulador está indisponível no momento. Tente de novo em alguns minutos.
        </AvisoPublico>
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
        <div className="grid grid-cols-1 gap-4 rounded-xl border bg-card p-5 shadow-xs sm:grid-cols-2">
          <BuscaEmpreendimento empreendimentos={empreendimentos} selecionado={selecionado} />
          <BuscaUnidade
            empreendimentoId={selecionado?.id}
            unidades={unidades}
            selecionada={unidadeSelecionada}
          />
        </div>

        {selecionado && u && !simulacao ? (
          <AvisoPublico>
            Esta unidade não está mais disponível para simulação. Escolha outra ou fale com quem
            está te atendendo.
          </AvisoPublico>
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
      <AvisoPublico>
        As condições desta unidade estão sendo revisadas. Fale com quem está te atendendo para
        receber a simulação.
      </AvisoPublico>
    );
  }

  return (
    <section>
      <header className="mb-4">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          {unidade.identificacao} · {empreendimento}
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
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
                className={cn(buttonVariants({ variant: "default" }), "h-10 w-full")}
              >
                Enviar proposta
              </Link>
            </div>
          ))}
        </div>
      </div>

      {/* No celular só um card cabe na tela, e nada indica que há outros. */}
      {condicoes.length > 1 ? (
        <p className="text-sm text-muted-foreground sm:hidden">
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

/** A moldura pública, com o título da ferramenta. */
function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <MolduraPublica
      contexto="Simulador"
      rodape="Valores sujeitos a confirmação. Simulação não constitui proposta nem reserva de unidade."
    >
      <header className="mb-6 flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Simulador</h1>
        <p className="text-sm text-muted-foreground">Condições de pagamento por unidade.</p>
      </header>
      {children}
    </MolduraPublica>
  );
}
