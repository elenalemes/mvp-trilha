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
        <p className="rounded-md border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          Este link não está mais válido. As condições desta unidade podem ter mudado — peça um
          link novo a quem está te atendendo.
        </p>
      </Moldura>
    );
  }

  const { unidade, empreendimento, incorporadora, condicoes } = simulacao;

  return (
    <Moldura>
      <header className="mb-7">
        <h1 className="font-display text-2xl font-bold text-trilha-900 sm:text-3xl">
          {unidade.identificacao} · {empreendimento}
        </h1>
        <p className="mt-1 text-sm text-trilha-400">
          {[caracteristicas(unidade), incorporadora].filter(Boolean).join(" · ")}
        </p>
      </header>

      {/* Aqui a faixa empilha em vez de rolar para o lado: quem abre sozinho não
          tem quem avise que existe mais coisa fora da tela. Na impressão vira
          sempre uma coluna. */}
      <div className="grid gap-4 sm:grid-cols-2 print:grid-cols-1">
        {condicoes.map((c) => (
          <CardPagamento key={c.ordem} condicao={c} modo="publico" />
        ))}
      </div>

      <section className="mt-8 rounded-lg border border-trilha-200 bg-white p-6 print:break-inside-avoid">
        <h2 className="font-display mb-3 text-xs font-semibold tracking-[0.12em] text-trilha-400 uppercase">
          Como funciona
        </h2>
        <ul className="flex flex-col gap-2.5 text-[15px] text-trilha-700">
          <li>Uma parte do valor é paga no ato.</li>
          <li>O restante da entrada é parcelado em prestações mensais, direto com a incorporadora.</li>
          <li>
            Ao fim desse período, o saldo do imóvel é quitado — por financiamento bancário ou por
            recursos próprios.
          </li>
          <li>As parcelas acima já incluem a gestão do negócio pela Trilha.</li>
        </ul>
      </section>
    </Moldura>
  );
}

/** Cabeçalho e respiro da página. */
function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-trilha-50/40 px-5 py-10 sm:px-8 print:bg-white print:py-0">
      <div className="mx-auto w-full max-w-4xl">
        <p className="font-display mb-8 text-sm font-semibold tracking-[0.18em] text-trilha-500 uppercase">
          Trilha
        </p>

        {children}

        <footer className="mt-10 text-xs text-trilha-300">
          Valores sujeitos a confirmação. Esta simulação não constitui proposta nem reserva de
          unidade.
        </footer>
      </div>
    </main>
  );
}
