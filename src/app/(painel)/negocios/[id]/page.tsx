import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ehAdmin, ehParceiro, getSessao } from "@/lib/sessao";
import { PageHeader } from "@/components/ui";
import { formatBRL, temConjuge } from "@/lib/br";
import { lerDadosComprador, type DadosComprador } from "@/lib/ficha";
import ErroLeitura from "@/components/erro-leitura";
import TarefaFechamento from "@/components/tarefa-fechamento";
import CancelarNegocio from "@/components/cancelar-negocio";
import LinkComprador from "@/components/link-comprador";
import {
  NOME_DO_ATOR,
  bolaCom,
  diasParado,
  estaFechada,
  etapas,
  nivelAberto,
  podeAbrirArquivos,
  podeMexer,
  progresso,
  type Arquivo,
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
  proposta: { id: string; codigo: string; prazo_meses: number; valor_parcela: number } | null;
  imovel: { identificacao: string } | null;
  empreendimento: { nome: string } | null;
  incorporadora: { nome: string } | null;
  parceiro: { nome: string } | null;
  comprador: { nome: string; cpf: string; email: string; telefone: string } | null;
};

const CAMPOS_TAREFA =
  `id, etapa, etapa_ordem, ordem, titulo, ator, tipo, exige_validade, interna,
   instrucoes, pede_conjuge, status, arquivo_path, referencia_externa, observacao, emitido_em, valido_ate,
   concluido_em`;

export default async function NegocioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const sessao = await getSessao();
  const admin = ehAdmin(sessao);
  const ator: Ator | null = admin ? "trilha" : ehParceiro(sessao) ? "parceiro" : "incorporadora";

  const supabase = await createClient();

  const { data: negocio, error: erroNegocio } = await supabase
    .from("negocio")
    .select(
      `id, status, created_at, token, cancelado_motivo, cancelado_em,
       proposta (id, codigo, prazo_meses, valor_parcela),
       imovel (identificacao),
       empreendimento (nome),
       incorporadora (nome),
       parceiro (nome),
       comprador (nome, cpf, email, telefone)`,
    )
    .eq("id", id)
    .maybeSingle<Ficha>();

  // "Não existe" e "não consigo ler" são coisas diferentes (convenção do projeto).
  if (erroNegocio) return <ErroLeitura oQue="do negócio" erro={erroNegocio} />;
  if (!negocio) notFound();

  const { data, error } = await supabase
    .from("checklist_item")
    .select(CAMPOS_TAREFA)
    .eq("negocio_id", id)
    .returns<Tarefa[]>();

  if (error) return <ErroLeitura oQue="das tarefas do fechamento" erro={error} />;

  // Só voltam os anexos que esta pessoa pode abrir — a policy é a mesma do
  // bucket. Os documentos do comprador não chegam para a incorporadora.
  const { data: anexos, error: erroAnexos } = await supabase
    .from("checklist_arquivo")
    .select("id, checklist_item_id, nome_original, tipo_mime, tamanho_bytes, pessoa, created_at")
    .eq("negocio_id", id)
    .order("created_at")
    .returns<Arquivo[]>();

  if (erroAnexos) return <ErroLeitura oQue="dos arquivos do fechamento" erro={erroAnexos} />;

  // Os dados do comprador abrem dentro da tarefa, então a página já os traz.
  // Só para quem lê a ficha — a incorporadora recebe `null` e vê "restrito".
  // Com cônjuge, os documentos do comprador se dividem em dois grupos.
  let dadosComprador: DadosComprador | null = null;
  if (ator === "trilha" || ator === "parceiro") {
    const lido = await lerDadosComprador(supabase, id, negocio.comprador);
    if (!lido.ok) return <ErroLeitura oQue="dos dados do comprador" erro={lido.erro} />;
    dadosComprador = lido.dados;
  }
  const comConjuge = temConjuge(dadosComprador?.estadoCivil);

  const anexosDa = (tarefaId: string) => (anexos ?? []).filter((a) => a.checklist_item_id === tarefaId);

  const tarefas = data ?? [];
  const esperando = bolaCom(tarefas);
  const nivel = nivelAberto(tarefas);
  const pct = progresso(tarefas);
  const dias = diasParado(tarefas, negocio.created_at);

  const cancelado = negocio.status === "cancelado";
  const listaEtapas = etapas(tarefas);
  const naEtapa = tarefas.filter((t) => !estaFechada(t) && t.etapa_ordem === nivel).length;

  return (
    <>
      <PageHeader
        titulo={negocio.imovel?.identificacao ?? "Negócio"}
        descricao={[negocio.empreendimento?.nome, negocio.incorporadora?.nome].filter(Boolean).join(" · ")}
        voltar={{ href: "/negocios", label: "Setups de negócios" }}
        acaoSecundaria={
          admin && negocio.proposta
            ? { href: `/propostas/${negocio.proposta.id}`, label: `Ver proposta ${negocio.proposta.codigo}` }
            : undefined
        }
      />

      {cancelado ? (
        <section className="mb-6 rounded-xl border bg-muted px-5 py-4">
          <p className="text-sm font-semibold text-foreground">Negócio cancelado</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {negocio.cancelado_motivo ?? "Sem motivo registrado."}
            {negocio.cancelado_em ? ` · ${new Date(negocio.cancelado_em).toLocaleDateString("pt-BR")}` : ""}
          </p>
        </section>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* ------------------------------------------------ as etapas */}
        <div className="flex min-w-0 flex-col gap-4">
          {listaEtapas.map((etapa, i) => {
            const liberada = nivel === null || etapa.nivel <= nivel;
            const feitas = etapa.tarefas.filter(estaFechada).length;
            const completa = feitas === etapa.tarefas.length;
            // A etapa que trava esta: a última do nível anterior aberto.
            const anterior = listaEtapas.filter((e) => e.nivel < etapa.nivel).at(-1);

            return (
              <section key={etapa.nome} className="overflow-hidden rounded-xl border bg-card shadow-xs">
                <header className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5">
                  <h2 className="text-sm font-semibold text-foreground">
                    <span className="mr-2 text-muted-foreground tabular-nums">{i + 1}</span>
                    {etapa.nome}
                  </h2>
                  {completa ? (
                    <Chip tom="sucesso">Concluída</Chip>
                  ) : liberada ? (
                    <Chip tom="destaque">
                      {feitas} de {etapa.tarefas.length}
                    </Chip>
                  ) : (
                    <Chip tom="neutro">Libera depois de {anterior?.nome.toLowerCase() ?? "a etapa anterior"}</Chip>
                  )}
                </header>

                <ul>
                  {etapa.tarefas.map((t) => (
                    <TarefaFechamento
                      key={t.id}
                      tarefa={t}
                      negocioId={negocio.id}
                      podeAgir={liberada && !cancelado && podeMexer(t, ator)}
                      liberada={liberada}
                      arquivos={anexosDa(t.id)}
                      podeAbrir={podeAbrirArquivos(t, ator)}
                      podeAbrirFicha={ator === "trilha" || ator === "parceiro"}
                      porPessoa={comConjuge && t.ator === "parceiro"}
                      dadosComprador={t.tipo === "formulario" ? dadosComprador : undefined}
                      cancelado={cancelado}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>

        {/* ------------------------------------------------ a lateral */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-20">
          {/* A manchete é DE QUEM É A BOLA. O percentual fica embaixo, menor. */}
          <section className="rounded-xl border bg-card p-5 shadow-xs">
            {esperando.length === 0 ? (
              <>
                <p className="text-sm text-muted-foreground">Situação</p>
                <p className="mt-0.5 text-base font-semibold text-sucesso">Tudo feito</p>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">Esperando</p>
                <p className="mt-0.5 text-base font-semibold tracking-tight text-foreground">
                  {esperando.map((a) => NOME_DO_ATOR[a]).join(", ")}
                </p>
                <p className={`mt-1 text-sm ${dias >= 7 ? "font-medium text-aviso" : "text-muted-foreground"}`}>
                  {naEtapa} tarefa{naEtapa === 1 ? "" : "s"} nesta etapa ·{" "}
                  {dias === 0 ? "movimentado hoje" : `parado há ${dias} dia${dias === 1 ? "" : "s"}`}
                </p>
              </>
            )}

            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Andamento</span>
              <span className="font-medium tabular-nums text-foreground">{pct}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-destaque" style={{ width: `${pct}%` }} />
            </div>

            <ol className="mt-4 flex flex-col">
              {listaEtapas.map((e) => {
                const feitas = e.tarefas.filter(estaFechada).length;
                const completa = feitas === e.tarefas.length;
                const liberada = nivel === null || e.nivel <= nivel;
                return (
                  <li key={e.nome} className="flex items-center gap-2.5 border-t py-2 text-sm first:border-t-0">
                    <span
                      aria-hidden="true"
                      className={`size-2 shrink-0 rounded-full ${completa ? "bg-sucesso" : liberada ? "bg-destaque" : "bg-border"}`}
                    />
                    <span className={`min-w-0 flex-1 truncate ${liberada ? "text-foreground" : "text-muted-foreground"}`}>
                      {e.nome}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {feitas}/{e.tarefas.length}
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>

          <section className="rounded-xl border bg-card p-5 shadow-xs">
            <h2 className="mb-2 text-sm font-semibold text-foreground">Negócio</h2>
            <dl className="flex flex-col text-sm">
              {negocio.proposta ? (
                <Dado termo="Proposta">
                  {admin ? (
                    <Link href={`/propostas/${negocio.proposta.id}`} className="underline-offset-4 hover:underline">
                      {negocio.proposta.codigo}
                    </Link>
                  ) : (
                    negocio.proposta.codigo
                  )}
                </Dado>
              ) : null}
              {negocio.proposta ? (
                <Dado termo="Condição">
                  {negocio.proposta.prazo_meses}× {formatBRL(negocio.proposta.valor_parcela)}
                </Dado>
              ) : null}
              {negocio.comprador ? <Dado termo="Comprador">{negocio.comprador.nome}</Dado> : null}
              {negocio.parceiro && ator !== "parceiro" ? <Dado termo="Corretor">{negocio.parceiro.nome}</Dado> : null}
              <Dado termo="Início">{new Date(negocio.created_at).toLocaleDateString("pt-BR")}</Dado>
            </dl>

            {/* O corretor também manda o link: é ele quem conversa com o
                comprador no dia a dia. A incorporadora não fala com o cliente. */}
            {(admin || ehParceiro(sessao)) && !cancelado ? (
              <div className="mt-4 border-t pt-4">
                <LinkComprador
                  token={negocio.token}
                  unidade={negocio.imovel?.identificacao ?? ""}
                  empreendimento={negocio.empreendimento?.nome ?? ""}
                />
              </div>
            ) : null}

            {admin && !cancelado && negocio.status !== "quitado" ? (
              <div className="mt-4 border-t pt-4">
                <CancelarNegocio negocioId={negocio.id} unidade={negocio.imovel?.identificacao ?? "—"} />
              </div>
            ) : null}
          </section>
        </aside>
      </div>
    </>
  );
}

function Dado({ termo, children }: { termo: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t py-2 first:border-t-0">
      <dt className="text-muted-foreground">{termo}</dt>
      <dd className="min-w-0 truncate text-right font-medium text-foreground">{children}</dd>
    </div>
  );
}

function Chip({ tom, children }: { tom: "sucesso" | "destaque" | "neutro"; children: React.ReactNode }) {
  const ponto = { sucesso: "bg-sucesso", destaque: "bg-destaque", neutro: "bg-muted-foreground/40" }[tom];
  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-full border bg-card px-2.5 text-xs font-medium whitespace-nowrap text-foreground">
      <span aria-hidden="true" className={`size-1.5 rounded-full ${ponto}`} />
      {children}
    </span>
  );
}
