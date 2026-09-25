import { Check } from "lucide-react";
import { AvisoPublico, MolduraPublica, TituloPublico } from "@/components/publico";
import type { Metadata } from "next";
import { lerAcompanhamento, type EtapaPublica } from "@/lib/acompanhamento";
import { nomeDoAtor } from "@/lib/fechamento";
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
        <div className="rounded-xl border bg-card p-8 shadow-xs">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Não encontrei este acompanhamento
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
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
        <TituloPublico titulo={`${dados.unidade} · ${dados.empreendimento}`} />
        <AvisoPublico>
          Este acompanhamento foi encerrado. Quem está te atendendo pode explicar o que houve e
          quais são os próximos passos.
        </AvisoPublico>
      </Moldura>
    );
  }

  const emAndamento = dados.etapas.filter((e) => e.situacao === "andamento");

  return (
    <Moldura>
      <TituloPublico
        titulo={`${dados.unidade} · ${dados.empreendimento}`}
        descricao={dados.incorporadora || undefined}
      />

      {/* A resposta à primeira pergunta: em que pé está. */}
      <section className="mb-6 rounded-xl border bg-card p-6 shadow-xs">
        <p className="mb-1 text-sm text-muted-foreground">Situação do seu processo</p>
        {dados.progresso === 100 ? (
          <p className="text-xl font-semibold tracking-tight text-sucesso">
            Tudo pronto do nosso lado.
          </p>
        ) : emAndamento.length > 0 ? (
          <>
            <p className="text-xl font-semibold tracking-tight text-foreground">
              Agora: {emAndamento.map((e) => e.nome.toLowerCase()).join(" e ")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Cuidando disso:{" "}
              {[...new Set(emAndamento.flatMap((e) => e.responsaveis))]
                .map((a) => nomeDoAtor(a, false, dados.proprietarioPF))
                .join(", ")}
              .
            </p>
          </>
        ) : (
          <p className="text-xl font-semibold tracking-tight text-foreground">
            Seu processo está em andamento.
          </p>
        )}

        <div className="mt-5 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-destaque transition-all"
              style={{ width: `${dados.progresso}%` }}
            />
          </div>
          <span className="text-sm tabular-nums text-muted-foreground">{dados.progresso}%</span>
        </div>
      </section>

      {/* A segunda: o que está acontecendo, e de quem depende. */}
      <section className="rounded-xl border bg-card p-6 shadow-xs">
        <h2 className="mb-5 text-base font-semibold text-foreground">Etapas</h2>
        <ol className="flex flex-col">
          {dados.etapas.map((e, i) => (
            <Etapa key={e.nome} etapa={e} ultima={i === dados.etapas.length - 1} pf={dados.proprietarioPF} />
          ))}
        </ol>
      </section>

      {dados.condicao ? (
        <section className="mt-6 rounded-xl border bg-card p-6 shadow-xs">
          <h2 className="mb-4 text-base font-semibold text-foreground">O que foi combinado</h2>
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

      <p className="mt-6 rounded-xl bg-muted px-5 py-4 text-sm leading-relaxed text-foreground">
        Guarde este link — ele é seu e continua funcionando até a entrega das chaves. Sempre que
        quiser saber como está, é só abrir de novo.
      </p>
    </Moldura>
  );
}

/**
 * Uma etapa na linha do tempo. O traço que liga as bolinhas fica verde até a
 * última concluída — é o "quanto já andou" sem precisar ler número.
 */
function Etapa({ etapa, ultima, pf }: { etapa: EtapaPublica; ultima: boolean; pf: boolean }) {
  const concluida = etapa.situacao === "concluida";
  const andamento = etapa.situacao === "andamento";

  return (
    <li className="relative flex gap-4 pb-6 last:pb-0">
      {!ultima ? (
        <span
          aria-hidden="true"
          className={`absolute top-7 bottom-0 left-[13px] w-0.5 ${concluida ? "bg-sucesso" : "bg-border"}`}
        />
      ) : null}

      <span
        aria-hidden="true"
        className={`relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border-2 ${
          concluida
            ? "border-sucesso bg-sucesso text-white"
            : andamento
              ? "border-destaque bg-card"
              : "border-border bg-card"
        }`}
      >
        {concluida ? (
          <Check className="size-4" strokeWidth={3} />
        ) : andamento ? (
          <span className="size-2.5 rounded-full bg-destaque" />
        ) : null}
      </span>

      <div className="min-w-0 flex-1 pt-0.5">
        <p className={`text-sm font-semibold ${etapa.situacao === "aguardando" ? "text-muted-foreground" : "text-foreground"}`}>
          {etapa.nome}
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {concluida
            ? "Concluída"
            : andamento
              ? `Em andamento · ${etapa.feitas} de ${etapa.total} · com ${etapa.responsaveis.map((a) => nomeDoAtor(a, false, pf)).join(" e ")}`
              : "Ainda não começou"}
        </p>
      </div>
    </li>
  );
}

function Linha({ termo, valor }: { termo: string; valor: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
      <dt className="text-sm text-muted-foreground">{termo}</dt>
      <dd className="ml-auto text-sm font-medium whitespace-nowrap tabular-nums text-foreground">
        {valor}
      </dd>
    </div>
  );
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <MolduraPublica
      contexto="Acompanhamento"
      largura="2xl"
      rodape="Esta página mostra o andamento do seu processo. Dúvidas sobre valores ou documentos: fale com quem está te atendendo."
    >
      {children}
    </MolduraPublica>
  );
}
