import { AvisoPublico, MolduraPublica, TituloPublico } from "@/components/publico";
import type { Metadata } from "next";
import { simular } from "@/lib/simulador";
import CardPagamento from "@/components/card-pagamento";
import { caracteristicas } from "@/lib/unidade";

/**
 * A tela do cliente.
 *
 * É a mesma simulação do `/simulador`, com uma diferença que decide tudo o que
 * está aqui: quem abre esta página está SOZINHO. Não tem corretor ao lado para
 * explicar, não vai trocar de unidade e não escolheu nada — recebeu um link
 * pronto, de uma unidade só.
 *
 * Por isso não existem campos de busca: mudar de unidade é papel de quem
 * enviou o link. E por isso existe o "Como funciona", que no simulador seria
 * ruído: o corretor já sabe.
 *
 * A página é montada para ser impressa — "salvar como PDF" no navegador tem
 * que sair legível, porque é assim que o cliente guarda ou mostra em casa.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Condições de pagamento · Trilha",
  description: "Condições de pagamento da unidade.",
  robots: { index: false, follow: false },
};

export default async function CondicoesPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; u?: string }>;
}) {
  const { e, u } = await searchParams;

  const simulacao = e && u ? await simular(e, u) : null;

  // Um link quebrado, uma unidade vendida no meio do caminho e um link sem
  // parâmetro caem todos aqui. O cliente não tem o que fazer com a diferença
  // entre esses casos — o que ele precisa é saber com quem falar.
  if (!simulacao || simulacao.condicoes.length === 0) {
    return (
      <Moldura>
        <AvisoPublico>
          Este link não está mais válido. As condições desta unidade podem ter mudado — peça um
          link novo a quem está te atendendo.
        </AvisoPublico>
      </Moldura>
    );
  }

  const { unidade, empreendimento, incorporadora, condicoes } = simulacao;

  return (
    <Moldura>
      <TituloPublico
        titulo={`${unidade.identificacao} · ${empreendimento}`}
        descricao={[caracteristicas(unidade), incorporadora].filter(Boolean).join(" · ")}
      />

      {/* Aqui a faixa empilha em vez de rolar para o lado: quem abre sozinho não
          tem quem avise que existe mais coisa fora da tela. Na impressão vira
          sempre uma coluna. */}
      <div className="grid gap-4 sm:grid-cols-2 print:grid-cols-1">
        {condicoes.map((c) => (
          <CardPagamento key={c.ordem} condicao={c} modo="publico" />
        ))}
      </div>

      <section className="mt-8 rounded-xl border bg-card p-6 shadow-xs print:break-inside-avoid print:shadow-none">
        <h2 className="mb-4 text-base font-semibold text-foreground">Como funciona</h2>
        <ol className="flex flex-col gap-4">
          {COMO_FUNCIONA.map((passo, i) => (
            <li key={passo} className="flex gap-3 text-sm leading-relaxed text-foreground">
              <span
                aria-hidden="true"
                className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground"
              >
                {i + 1}
              </span>
              <span className="pt-0.5">{passo}</span>
            </li>
          ))}
        </ol>
      </section>
    </Moldura>
  );
}

/** Os passos, na ordem em que acontecem para o comprador. */
const COMO_FUNCIONA = [
  "Uma parte do valor é paga no ato.",
  "O restante da entrada é parcelado em prestações mensais, direto com a incorporadora.",
  "Ao fim desse período, o saldo do imóvel é quitado — por financiamento bancário ou por recursos próprios.",
  "As parcelas acima já incluem a gestão do negócio pela Trilha.",
];

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <MolduraPublica
      contexto="Condições de pagamento"
      rodape="Valores sujeitos a confirmação. Esta simulação não constitui proposta nem reserva de unidade."
    >
      {children}
    </MolduraPublica>
  );
}
