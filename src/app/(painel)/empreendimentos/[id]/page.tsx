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

      <section className="mb-6 rounded-lg border border-trilha-200 bg-white p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-trilha-100 pb-3">
          <div>
            <h2 className="font-display text-xl font-semibold text-trilha-700">
              Opções de pagamento
            </h2>
            <p className="mt-0.5 text-sm text-trilha-400">
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
              className="font-display rounded-md border border-trilha-200 bg-white px-3.5 py-1.5 text-sm font-semibold tracking-wide text-trilha-700 transition-colors hover:border-trilha-500 hover:bg-trilha-50"
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
            className="font-display text-sm font-semibold tracking-wide text-trilha-500 uppercase underline underline-offset-2 hover:text-trilha-700"
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
        <div className="overflow-x-auto rounded-lg border border-trilha-200 bg-white">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead>
              <tr className="border-b border-trilha-100">
                {["Imóvel", "Características", "Valor", "Status", "Cadastrado em", ""].map(
                  (h, i) => (
                    <th
                      key={`${h}-${i}`}
                      className="font-display px-5 py-3 text-sm font-semibold tracking-wide text-trilha-400 uppercase"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {imoveis.map((imovel) => (
                <tr key={imovel.id} className="border-b border-trilha-100 last:border-0">
                  <td className="px-5 py-4">
                    <Link
                      href={`/empreendimentos/${id}/imoveis/${imovel.id}`}
                      className="font-display text-[17px] font-semibold text-trilha-700 underline underline-offset-2 hover:text-trilha-500"
                    >
                      {imovel.identificacao}
                    </Link>
                    <span className="block text-sm text-trilha-400">
                      {imovelTipoLabel(imovel.tipo)}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-[15px] text-trilha-400">
                    {[
                      imovel.num_quartos ? `${imovel.num_quartos} dorm.` : null,
                      imovel.num_vagas ? `${imovel.num_vagas} vaga(s)` : null,
                      imovel.metros_quadrados ? formatArea(imovel.metros_quadrados) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </td>
                  <td className="px-5 py-4 text-[15px] tabular-nums text-trilha-900">
                    {formatBRL(imovel.valor)}
                    {imovel.valor !== null ? (
                      <span className="block text-sm text-trilha-400">
                        {formatBRL(valorReajustado(imovel.valor))} em {PRAZO_PADRAO_MESES} meses
                      </span>
                    ) : null}
                  </td>
                  <td className="px-5 py-4">
                    <StatusPill status={imovel.status} label={imovelStatusLabel(imovel.status)} />
                  </td>
                  <td className="px-5 py-4 text-[15px] tabular-nums text-trilha-400">
                    {dataCurta(imovel.created_at)}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Link
                      href={`/empreendimentos/${id}/imoveis/${imovel.id}`}
                      className="font-display text-sm font-semibold tracking-wide text-trilha-500 uppercase underline underline-offset-2 hover:text-trilha-700"
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
