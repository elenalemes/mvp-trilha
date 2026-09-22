import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ehAdmin, ehParceiro, getSessao } from "@/lib/sessao";
import { PageHeader } from "@/components/ui";
import ErroLeitura from "@/components/erro-leitura";
import TarefaFechamento from "@/components/tarefa-fechamento";
import CancelarNegocio from "@/components/cancelar-negocio";
import {
  NOME_DO_ATOR,
  bolaCom,
  diasParado,
  etapas,
  nivelAberto,
  podeMexer,
  progresso,
  type Ator,
  type Tarefa,
} from "@/lib/fechamento";

/**
 * O fechamento de um negócio.
 *
 * A mesma tela para a Trilha, a incorporadora e o corretor — cada um enxerga o
 * processo inteiro e mexe só no que é dele. Ver o que o outro está devendo é
 * metade do valor daqui: é o que transforma "cadê a matrícula?" numa linha que
 * a pessoa vê sozinha.
 *
 * A manchete é DE QUEM É A BOLA, com há quantos dias. O percentual fica menor,
 * ao lado, porque ele engana: 18 de 20 tarefas mostram 90% num fechamento que
 * pode estar parado há três semanas.
 */
export const dynamic = "force-dynamic";

type Ficha = {
  id: string;
  status: string;
  created_at: string;
  token: string;
  cancelado_motivo: string | null;
  cancelado_em: string | null;
  proposta: { id: string; codigo: string } | null;
  imovel: { identificacao: string } | null;
  empreendimento: { nome: string } | null;
  incorporadora: { nome: string } | null;
  parceiro: { nome: string } | null;
  comprador: { nome: string } | null;
};

const CAMPOS_TAREFA =
  `id, etapa, etapa_ordem, ordem, titulo, ator, tipo, exige_validade, interna,
   status, arquivo_path, referencia_externa, observacao, emitido_em, valido_ate,
   concluido_em`;

export default async function NegocioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const sessao = await getSessao();
  const admin = ehAdmin(sessao);
  const ator: Ator | null = admin ? "trilha" : ehParceiro(sessao) ? "parceiro" : "incorporadora";

  const supabase = await createClient();

  const { data: negocio } = await supabase
    .from("negocio")
    .select(
      `id, status, created_at, token, cancelado_motivo, cancelado_em,
       proposta (id, codigo),
       imovel (identificacao),
       empreendimento (nome),
       incorporadora (nome),
       parceiro (nome),
       comprador (nome)`,
    )
    .eq("id", id)
    .maybeSingle<Ficha>();

  if (!negocio) notFound();

  const { data, error } = await supabase
    .from("checklist_item")
    .select(CAMPOS_TAREFA)
    .eq("negocio_id", id)
    .returns<Tarefa[]>();

  if (error) return <ErroLeitura oQue="das tarefas do fechamento" erro={error} />;

  const tarefas = data ?? [];
  const esperando = bolaCom(tarefas);
  const nivel = nivelAberto(tarefas);
  const pct = progresso(tarefas);
  const dias = diasParado(tarefas, negocio.created_at);

  return (
    <>
      <PageHeader
        titulo={negocio.imovel?.identificacao ?? "Negócio"}
        descricao={[
          negocio.empreendimento?.nome,
          negocio.incorporadora?.nome,
          negocio.proposta?.codigo,
        ]
          .filter(Boolean)
          .join(" · ")}
        voltar={{ href: "/negocios", label: "Setups de negócios" }}
      />

      {/* A manchete. Antes de qualquer barra. */}
      <section className="mb-8 rounded-lg border border-trilha-200 bg-white p-6">
        {esperando.length === 0 ? (
          <p className="font-display text-xl font-semibold text-emerald-700">
            Nada pendente — todas as tarefas estão feitas.
          </p>
        ) : (
          <>
            <p className="font-display text-xl font-semibold text-trilha-900 sm:text-2xl">
              Esperando: {esperando.map((a) => NOME_DO_ATOR[a]).join(" e ")}
            </p>
            <p className="mt-1 text-[15px] text-trilha-400">
              {tarefas.filter((t) => !["concluido", "nao_se_aplica"].includes(t.status) && t.etapa_ordem === nivel).length}{" "}
              tarefa(s) nesta etapa · {dias === 0 ? "movimentado hoje" : `parado há ${dias} dia(s)`}
            </p>
          </>
        )}

        <div className="mt-5 flex items-center gap-3">
          <div className="h-2 max-w-sm flex-1 overflow-hidden rounded-full bg-trilha-100">
            <div className="h-full rounded-full bg-trilha-500" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-sm tabular-nums text-trilha-400">{pct}%</span>
        </div>

        {admin ? (
          <p className="mt-5 border-t border-trilha-100 pt-4 text-sm text-trilha-400">
            Comprador: <span className="text-trilha-900">{negocio.comprador?.nome ?? "—"}</span> ·
            Corretor: <span className="text-trilha-900">{negocio.parceiro?.nome ?? "—"}</span>
            {negocio.proposta ? (
              <>
                {" · "}
                <Link
                  href={`/propostas/${negocio.proposta.id}`}
                  className="underline underline-offset-2 hover:text-trilha-700"
                >
                  ver a proposta
                </Link>
              </>
            ) : null}
          </p>
        ) : null}
      </section>

      <div className="flex flex-col gap-6">
        {etapas(tarefas).map((etapa) => {
          const liberada = nivel === null || etapa.nivel <= nivel;
          const visiveis = etapa.tarefas;

          return (
            <section
              key={etapa.nome}
              className="overflow-hidden rounded-lg border border-trilha-200 bg-white"
            >
              <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-trilha-100 px-5 py-4">
                <h2 className="font-display text-lg font-semibold text-trilha-900">{etapa.nome}</h2>
                <span className="text-sm text-trilha-400">
                  {liberada
                    ? `${visiveis.filter((t) => ["concluido", "nao_se_aplica"].includes(t.status)).length} de ${visiveis.length}`
                    : "libera quando a etapa anterior fechar"}
                </span>
              </header>

              <ul>
                {visiveis.map((t) => (
                  <TarefaFechamento
                    key={t.id}
                    tarefa={t}
                    negocioId={negocio.id}
                    podeAgir={liberada && podeMexer(t, ator)}
                    liberada={liberada}
                  />
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {admin ? (
        <p className="mt-8 text-xs text-trilha-400">
          Link do comprador (a página dele ainda não existe — item A4):{" "}
          <code className="rounded bg-trilha-50 px-1.5 py-0.5">{negocio.token}</code>
        </p>
      ) : null}

      {admin && negocio.status !== "cancelado" && negocio.status !== "quitado" ? (
        <CancelarNegocio negocioId={negocio.id} unidade={negocio.imovel?.identificacao ?? "—"} />
      ) : null}

      {negocio.status === "cancelado" ? (
        <section className="mt-10 rounded-lg border border-slate-200 bg-slate-50 p-6">
          <h2 className="font-display text-sm font-semibold tracking-[0.12em] text-slate-500 uppercase">
            Negócio cancelado
          </h2>
          <p className="mt-2 text-[15px] text-slate-700">
            {negocio.cancelado_motivo ?? "Sem motivo registrado."}
          </p>
          {negocio.cancelado_em ? (
            <p className="mt-1 text-sm text-slate-500">
              {new Date(negocio.cancelado_em).toLocaleString("pt-BR")}
            </p>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
