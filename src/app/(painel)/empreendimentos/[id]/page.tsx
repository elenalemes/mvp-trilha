import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessao, podeEditar } from "@/lib/sessao";
import { formatArea, formatBRL, imovelStatusLabel, imovelTipoLabel } from "@/lib/br";
import { PRAZO_PADRAO_MESES, valorReajustado } from "@/lib/trilha";
import { EmptyState, PageHeader, Stat, StatusPill } from "@/components/ui";
import ListaOpcoes from "@/components/lista-opcoes";
import { opcoesQueValem } from "@/lib/opcoes";
import { Busca } from "@/components/busca";

type Empreendimento = {
  id: string;
  nome: string;
  endereco: string | null;
  incorporadora_id: string;
  incorporadora: { nome: string; percentual_comissao: number } | null;
};

type Imovel = {
  id: string;
  identificacao: string;
  tipo: string;
  status: string;
  valor: number | null;
  metros_quadrados: number | null;
  num_quartos: number | null;
  num_vagas: number | null;
  created_at: string;
};

const dataCurta = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

/** PostgREST separa condições do `or` por vírgula — então ela não pode passar. */
const limpar = (termo: string) => termo.replace(/[,()*]/g, " ").trim();

export default async function EmpreendimentoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { id } = await params;
  const { q } = await searchParams;
  const termo = limpar(q ?? "");

  const sessao = await getSessao();
  const admin = sessao?.conta?.tipo === "trilha_admin";
  const edita = podeEditar(sessao);

  const supabase = await createClient();

  const { data: empreendimento } = await supabase
    .from("empreendimento")
    .select("id, nome, endereco, incorporadora_id, incorporadora(nome, percentual_comissao)")
    .eq("id", id)
    .maybeSingle<Empreendimento>();

  if (!empreendimento) notFound();

  let consulta = supabase
    .from("imovel")
    .select(
      `id, identificacao, tipo, status, valor, metros_quadrados,
       num_quartos, num_vagas, created_at`,
    )
    .eq("empreendimento_id", id)
    .order("identificacao");

  if (termo) {
    consulta = consulta.or(`identificacao.ilike.*${termo}*,numero_matricula.ilike.*${termo}*`);
  }

  const { data: imoveis } = await consulta.returns<Imovel[]>();

  const buscando = Boolean(termo);

  // Os números por status vêm de uma contagem própria, sem o filtro da busca:
  // "Disponíveis" tem que continuar sendo o total do empreendimento.
  const contar = async (status: string) => {
    const { count } = await supabase
      .from("imovel")
      .select("id", { count: "exact", head: true })
      .eq("empreendimento_id", id)
      .eq("status", status);
    return count ?? 0;
  };

  const { count: totalNoEmpreendimento } = await supabase
    .from("imovel")
    .select("id", { count: "exact", head: true })
    .eq("empreendimento_id", id);

  const [disponiveis, emNegociacao, emTrilha] = await Promise.all([
    contar("disponivel"),
    contar("em_negociacao"),
    contar("em_trilha"),
  ]);

  const { opcoes, origem } = await opcoesQueValem(
    supabase,
    empreendimento.incorporadora_id,
    id,
  );

  return (
    <>
      <PageHeader
        titulo={empreendimento.nome}
        descricao={
          admin && empreendimento.incorporadora?.nome
            ? `${empreendimento.incorporadora.nome}${empreendimento.endereco ? ` · ${empreendimento.endereco}` : ""}`
            : (empreendimento.endereco ?? undefined)
        }
        voltar={{ href: "/empreendimentos", label: "Empreendimentos" }}
        acaoSecundaria={
          edita
            ? { href: `/empreendimentos/${id}/editar`, label: "Editar empreendimento" }
            : undefined
        }
        acao={
          edita
            ? { href: `/empreendimentos/${id}/imoveis/novo`, label: "Cadastrar imóvel" }
            : undefined
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat valor={totalNoEmpreendimento ?? 0} label="Imóveis cadastrados" />
        <Stat valor={disponiveis} label="Disponíveis" tom="positivo" />
        <Stat valor={emNegociacao} label="Em negociação" tom="atencao" />
        <Stat valor={emTrilha} label="Em Trilha" tom="destaque" />
      </div>

      <section className="mb-6 rounded-xl border bg-card p-6 shadow-xs">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div>
            <h2 className="text-xl font-semibold text-foreground">
              Opções de pagamento
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {origem === "empreendimento"
                ? "Condições próprias deste empreendimento."
                : origem === "incorporadora"
                  ? `Usando o padrão de ${empreendimento.incorporadora?.nome ?? "a incorporadora"}.`
                  : "Nenhuma condição definida — os imóveis aparecem sem formatos de pagamento."}
            </p>
          </div>
          {edita ? (
            <Link
              href={`/empreendimentos/${id}/opcoes-pagamento`}
              className="rounded-md border border-border bg-card px-3.5 py-1.5 text-sm font-semibold text-foreground transition-colors hover:border-foreground/30 hover:bg-accent"
            >
              {origem === "empreendimento" ? "Editar condições" : "Criar condições próprias"}
            </Link>
          ) : null}
        </div>
        <ListaOpcoes
          opcoes={opcoes}
          percentualComissao={empreendimento.incorporadora?.percentual_comissao}
        />
      </section>

      <div className="mb-5 flex flex-wrap items-center gap-4">
        <Suspense fallback={null}>
          <Busca
            base={`/empreendimentos/${id}`}
            placeholder="Buscar por unidade ou matrícula"
          />
        </Suspense>
        {buscando ? (
          <Link
            href={`/empreendimentos/${id}`}
            className="text-sm font-semibold text-foreground underline-offset-4 hover:underline hover:text-foreground"
          >
            Limpar
          </Link>
        ) : null}
      </div>

      {!imoveis || imoveis.length === 0 ? (
        <EmptyState
          titulo={buscando ? "Nenhum imóvel encontrado" : "Nenhum imóvel neste empreendimento"}
          texto={
            buscando
              ? `Nada corresponde a “${termo}”. Tente a identificação da unidade ou a matrícula.`
              : "Cadastre as unidades deste empreendimento que estarão disponíveis no formato da Trilha."
          }
          acao={edita ? { href: `/empreendimentos/${id}/imoveis/novo`, label: "Cadastrar imóvel" } : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead>
              <tr className="border-b border-border">
                {["Imóvel", "Características", "Valor", "Status", "Cadastrado em", ""].map(
                  (h, i) => (
                    <th
                      key={`${h}-${i}`}
                      className="bg-muted/50 px-4 py-2.5 text-xs font-medium whitespace-nowrap text-muted-foreground"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {imoveis.map((imovel) => (
                <tr key={imovel.id} className="border-b border-border transition-colors last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <Link
                      href={`/empreendimentos/${id}/imoveis/${imovel.id}`}
                      className="text-sm font-semibold text-foreground underline-offset-4 hover:underline hover:text-foreground"
                    >
                      {imovel.identificacao}
                    </Link>
                    <span className="block text-sm text-muted-foreground">
                      {imovelTipoLabel(imovel.tipo)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {[
                      imovel.num_quartos ? `${imovel.num_quartos} dorm.` : null,
                      imovel.num_vagas ? `${imovel.num_vagas} vaga(s)` : null,
                      imovel.metros_quadrados ? formatArea(imovel.metros_quadrados) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-sm tabular-nums text-foreground">
                    {formatBRL(imovel.valor)}
                    {imovel.valor !== null ? (
                      <span className="block text-sm text-muted-foreground">
                        {formatBRL(valorReajustado(imovel.valor))} em {PRAZO_PADRAO_MESES} meses
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={imovel.status} label={imovelStatusLabel(imovel.status)} />
                  </td>
                  <td className="px-4 py-3 text-sm tabular-nums text-muted-foreground">
                    {dataCurta(imovel.created_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/empreendimentos/${id}/imoveis/${imovel.id}`}
                      className="text-sm font-semibold text-foreground underline-offset-4 hover:underline hover:text-foreground"
                    >
                      Abrir
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
