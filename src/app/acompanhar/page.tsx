import type { Metadata } from "next";
import { lerAcompanhamento, type EtapaPublica } from "@/lib/acompanhamento";
import { NOME_DO_ATOR } from "@/lib/fechamento";
import { formatBRL } from "@/lib/br";

/**
 * O acompanhamento do comprador.
 *
 * Quem abre esta página está sozinho, ansioso e sem ninguém a quem perguntar —
 * e vai voltar aqui muitas vezes, com o mesmo link, até receber a chave. Então
 * a tela responde as três perguntas dele, nesta ordem: em que pé está, o que
 * está acontecendo agora, e de quem depende.
 *
 * Mostra ETAPA, não tarefa. Saber que falta a negativa de Sanep não ajuda o
 * comprador — ele não pode resolver isso e ligaria para o corretor por
 * ansiedade. Saber que a documentação está em andamento, e com quem, ajuda.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Acompanhe sua compra · Trilha",
  robots: { index: false, follow: false },
};

export default async function AcompanharPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  const dados = t ? await lerAcompanhamento(t) : null;

  if (!dados) {
    return (
      <Moldura>
        <div className="rounded-lg border border-trilha-200 bg-white p-8">
          <h1 className="font-display text-2xl font-bold text-trilha-900">
            Não encontrei este acompanhamento
          </h1>
          <p className="mt-3 text-[15px] text-trilha-400">
            Confira se o link veio inteiro na mensagem. Se o problema continuar, fale com quem está
            te atendendo.
          </p>
        </div>
      </Moldura>
    );
  }

  // Cancelado é a única situação em que a página para de contar a história. O
  // motivo NÃO aparece: costuma ser justamente o que não se diz por texto.
  if (dados.cancelado) {
    return (
      <Moldura>
        <div className="rounded-lg border border-trilha-200 bg-white p-8">
          <h1 className="font-display text-2xl font-bold text-trilha-900">
            {dados.unidade} · {dados.empreendimento}
          </h1>
          <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-5 py-4 text-[15px] text-amber-800">
            Este acompanhamento foi encerrado. Quem está te atendendo pode explicar o que houve e
            quais são os próximos passos.
          </p>
        </div>
      </Moldura>
    );
  }

  const emAndamento = dados.etapas.filter((e) => e.situacao === "andamento");

  return (
    <Moldura>
      <header className="mb-8">
        <h1 className="font-display text-2xl font-bold text-trilha-900 sm:text-3xl">
          {dados.unidade} · {dados.empreendimento}
        </h1>
        {dados.incorporadora ? (
          <p className="mt-1 text-[15px] text-trilha-400">{dados.incorporadora}</p>
        ) : null}
      </header>

      {/* A resposta à primeira pergunta: em que pé está. */}
      <section className="mb-8 rounded-lg border border-trilha-200 bg-white p-6">
        {dados.progresso === 100 ? (
          <p className="font-display text-xl font-semibold text-emerald-700">
            Tudo pronto do nosso lado.
          </p>
        ) : emAndamento.length > 0 ? (
          <>
            <p className="font-display text-xl font-semibold text-trilha-900">
              Agora: {emAndamento.map((e) => e.nome.toLowerCase()).join(" e ")}
            </p>
            <p className="mt-1 text-[15px] text-trilha-400">
              Cuidando disso:{" "}
              {[...new Set(emAndamento.flatMap((e) => e.responsaveis))]
                .map((a) => NOME_DO_ATOR[a])
                .join(", ")}
              .
            </p>
          </>
        ) : (
          <p className="font-display text-xl font-semibold text-trilha-900">
            Seu processo está em andamento.
          </p>
        )}

        <div className="mt-5 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-trilha-100">
            <div
              className="h-full rounded-full bg-trilha-500 transition-all"
              style={{ width: `${dados.progresso}%` }}
            />
          </div>
          <span className="text-sm tabular-nums text-trilha-400">{dados.progresso}%</span>
        </div>
      </section>

      {/* A segunda: o que está acontecendo, e de quem depende. */}
      <ol className="flex flex-col gap-3">
        {dados.etapas.map((e) => (
          <Etapa key={e.nome} etapa={e} />
        ))}
      </ol>

      {dados.condicao ? (
        <section className="mt-8 rounded-lg border border-trilha-200 bg-white p-6">
          <h2 className="font-display mb-3 text-xs font-semibold tracking-[0.12em] text-trilha-400 uppercase">
            O que foi combinado
          </h2>
          <dl className="flex flex-col gap-2.5">
            <Linha
              termo="No ato"
              valor={dados.condicao.ato > 0 ? formatBRL(dados.condicao.ato) : "—"}
            />
            <Linha
              termo={`Durante ${dados.condicao.prazoMeses} meses`}
              valor={`${dados.condicao.prazoMeses}× ${formatBRL(dados.condicao.parcela)}`}
            />
            <Linha
              termo={`No saldo (${dados.condicao.prazoMeses + 1}º mês)`}
              valor={formatBRL(dados.condicao.saldo)}
            />
          </dl>
        </section>
      ) : null}

      <p className="mt-8 rounded-lg bg-trilha-50 px-5 py-4 text-[15px] text-trilha-700">
        Guarde este link — ele é seu e continua funcionando até a entrega das chaves. Sempre que
        quiser saber como está, é só abrir de novo.
      </p>
    </Moldura>
  );
}

const CORES: Record<EtapaPublica["situacao"], string> = {
  concluida: "border-emerald-200 bg-emerald-50",
  andamento: "border-trilha-300 bg-white",
  aguardando: "border-trilha-100 bg-white",
};

function Etapa({ etapa }: { etapa: EtapaPublica }) {
  const concluida = etapa.situacao === "concluida";

  return (
    <li className={`flex items-start gap-4 rounded-lg border p-5 ${CORES[etapa.situacao]}`}>
      <span
        className={`mt-0.5 text-lg ${
          concluida
            ? "text-emerald-600"
            : etapa.situacao === "andamento"
              ? "text-trilha-500"
              : "text-trilha-200"
        }`}
        aria-hidden="true"
      >
        {concluida ? "✓" : etapa.situacao === "andamento" ? "◔" : "○"}
      </span>

      <div className="min-w-0 flex-1">
        <p
          className={`font-display text-[17px] font-semibold ${
            etapa.situacao === "aguardando" ? "text-trilha-400" : "text-trilha-900"
          }`}
        >
          {etapa.nome}
        </p>
        <p className="mt-0.5 text-sm text-trilha-400">
          {concluida
            ? "Concluída"
            : etapa.situacao === "andamento"
              ? `Em andamento · ${etapa.feitas} de ${etapa.total} · com ${etapa.responsaveis.map((a) => NOME_DO_ATOR[a]).join(" e ")}`
              : "Ainda não começou"}
        </p>
      </div>
    </li>
  );
}

function Linha({ termo, valor }: { termo: string; valor: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
      <dt className="text-sm text-trilha-400">{termo}</dt>
      <dd className="ml-auto text-[15px] whitespace-nowrap tabular-nums text-trilha-900">
        {valor}
      </dd>
    </div>
  );
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-trilha-50/40 px-5 py-10 sm:px-8">
      <div className="mx-auto w-full max-w-2xl">
        <p className="font-display mb-8 text-sm font-semibold tracking-[0.18em] text-trilha-500 uppercase">
          Trilha
        </p>

        {children}

        <footer className="mt-10 text-xs text-trilha-300">
          Esta página mostra o andamento do seu processo. Dúvidas sobre valores ou documentos: fale
          com quem está te atendendo.
        </footer>
      </div>
    </main>
  );
}
