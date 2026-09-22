import type { Metadata } from "next";
import Link from "next/link";
import { simular } from "@/lib/simulador";
import { createClient } from "@/lib/supabase/server";
import { getSessao } from "@/lib/sessao";
import CardPagamento from "@/components/card-pagamento";
import { caracteristicas } from "@/lib/unidade";
import FormProposta, { type CorretorConhecido } from "./form";

/**
 * Enviar proposta.
 *
 * A tela chega sempre de um card do simulador, com a condição já escolhida —
 * por isso ela mostra esse card de novo, fixo ao lado do formulário. O corretor
 * está preenchendo dados do cliente dele; ter os números sumindo da vista
 * enquanto digita é o jeito mais fácil de mandar a condição errada.
 *
 * A `ordem` da condição é a ÚNICA coisa que viaja pela URL. Os valores são
 * recalculados no servidor, aqui e de novo no envio: link editado à mão não
 * vira proposta com número inventado.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Enviar proposta · Trilha",
  description: "Envie a proposta de negócio desta unidade.",
  robots: { index: false, follow: false },
};

export default async function PropostaPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; u?: string; c?: string }>;
}) {
  const { e, u, c } = await searchParams;
  const ordem = Number(c);

  const simulacao = e && u && Number.isFinite(ordem) ? await simular(e, u) : null;
  const condicao = simulacao?.condicoes.find((x) => x.ordem === ordem) ?? null;

  if (!simulacao || !condicao) {
    return (
      <Moldura>
        <p className="rounded-md border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          Não encontrei esta condição. A unidade pode ter saído do estoque ou as condições podem ter
          mudado desde que você abriu o simulador.
        </p>
        <p className="mt-4">
          <Link
            href="/simulador"
            className="font-display font-semibold text-trilha-700 underline underline-offset-2"
          >
            Voltar ao simulador
          </Link>
        </p>
      </Moldura>
    );
  }

  // Quem já é parceiro e entrou pelo atalho do painel não digita os próprios
  // dados de novo — eles aparecem preenchidos e travados, para ele conferir de
  // quem está saindo a proposta.
  const sessao = await getSessao();
  let corretor: CorretorConhecido | null = null;

  if (sessao?.conta?.tipo === "parceiro") {
    const supabase = await createClient();
    const { data } = await supabase
      .from("parceiro")
      .select("nome, documento, creci, email, telefone")
      .eq("conta_id", sessao.usuarioId)
      .maybeSingle<CorretorConhecido>();
    corretor = data ?? null;
  }

  const { unidade, empreendimento, incorporadora } = simulacao;

  return (
    <Moldura>
      <header className="mb-7">
        <Link
          href={`/simulador?e=${simulacao.empreendimentoId}&u=${unidade.id}`}
          className="font-display text-sm font-semibold tracking-wide text-trilha-500 uppercase underline underline-offset-2 hover:text-trilha-700"
        >
          ← Voltar à simulação
        </Link>
        <h1 className="font-display mt-3 text-2xl font-bold text-trilha-900 sm:text-3xl">
          Enviar proposta
        </h1>
        <p className="mt-1 text-[15px] text-trilha-400">
          {unidade.identificacao} · {empreendimento}
          {[caracteristicas(unidade), incorporadora].filter(Boolean).length
            ? ` · ${[caracteristicas(unidade), incorporadora].filter(Boolean).join(" · ")}`
            : ""}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start">
        <div className="lg:sticky lg:top-8">
          <CardPagamento condicao={condicao} modo="publico" />
        </div>

        <FormProposta
          empreendimentoId={simulacao.empreendimentoId}
          imovelId={unidade.id}
          ordem={condicao.ordem}
          corretor={corretor}
        />
      </div>
    </Moldura>
  );
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-trilha-50/40 px-5 py-10 sm:px-8">
      <div className="mx-auto w-full max-w-5xl">
        <p className="font-display mb-8 text-sm font-semibold tracking-[0.18em] text-trilha-500 uppercase">
          Trilha
        </p>

        {children}

        <footer className="mt-10 text-xs text-trilha-300">
          A proposta passa por análise da equipe da Trilha. Enviar não reserva a unidade.
        </footer>
      </div>
    </main>
  );
}
