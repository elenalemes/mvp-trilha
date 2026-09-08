import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getSessao, podeEditar } from "@/lib/sessao";
import { formatArea, formatBRL, imovelStatusLabel, imovelTipoLabel } from "@/lib/br";
import { PRAZO_PADRAO_MESES, valorReajustado } from "@/lib/trilha";
import { EmptyState, PageHeader, StatusPill } from "@/components/ui";
import { FiltroIncorporadora } from "@/components/filtro-incorporadora";
import { Busca } from "@/components/busca";

type Linha = {
  id: string;
  identificacao: string;
  tipo: string;
  status: string;
  valor: number | null;
  metros_quadrados: number | null;
  num_quartos: number | null;
  num_vagas: number | null;
  created_at: string;
  empreendimento: {
    id: string;
    nome: string;
    incorporadora_id: string;
    incorporadora: { nome: string } | null;
  } | null;
};

/** PostgREST separa condições do `or` por vírgula — então ela não pode passar. */
const limpar = (termo: string) => termo.replace(/[,()*]/g, " ").trim();

const dataCurta = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

export default async function ImoveisPage({
  searchParams,
}: {
  searchParams: Promise<{ incorporadora?: string; q?: string }>;
}) {
  const { incorporadora, q } = await searchParams;
  const termo = limpar(q ?? "");
  const sessao = await getSessao();
  const admin = sessao?.conta?.tipo === "trilha_admin";
  const edita = podeEditar(sessao);

  const supabase = await createClient();

  const { data: incorporadoras } = await supabase
    .from("incorporadora")
    .select("id, nome")
    .order("nome")
    .returns<{ id: string; nome: string }[]>();

  const { count: empreendimentos } = await supabase
    .from("empreendimento")
    .select("id", { count: "exact", head: true });

  let consulta = supabase
    .from("imovel")
    .select(
      `id, identificacao, tipo, status, valor, metros_quadrados, num_quartos, num_vagas, created_at,
       empreendimento!inner (id, nome, incorporadora_id, incorporadora (nome))`,
    )
    .order("created_at", { ascending: false });

  if (incorporadora) {
    consulta = consulta.eq("empreendimento.incorporadora_id", incorporadora);
  }

  if (termo) {
    // Busca na identificação e na matrícula do imóvel. Para achar também pelo
    // nome do empreendimento, descobrimos antes quais empreendimentos batem —
    // uma condição `or` do PostgREST não cruza tabelas sozinha.
    const { data: empreendimentosBuscados } = await supabase
      .from("empreendimento")
      .select("id")
      .ilike("nome", `%${termo}%`)
      .returns<{ id: string }[]>();

    const condicoes = [`identificacao.ilike.*${termo}*`, `numero_matricula.ilike.*${termo}*`];
    const ids = (empreendimentosBuscados ?? []).map((e) => e.id);
    if (ids.length) condicoes.push(`empreendimento_id.in.(${ids.join(",")})`);

    consulta = consulta.or(condicoes.join(","));
  }

  const { data } = await consulta.returns<Linha[]>();

  const semEmpreendimento = (empreendimentos ?? 0) === 0;
  const filtrando = Boolean(incorporadora);
  const buscando = Boolean(termo);
  const nomeFiltrado = incorporadoras?.find((i) => i.id === incorporadora)?.nome;

  return (
    <>
      <PageHeader
        titulo="Imóveis"
        descricao={
          filtrando ? `Unidades de ${nomeFiltrado ?? "—"}.` : "As unidades disponibilizadas na plataforma."
        }
        acao={semEmpreendimento || !edita ? undefined : { href: "/empreendimentos", label: "Cadastrar imóvel" }}
      />

      <div className="mb-5 flex flex-wrap items-center gap-4">
        <Suspense fallback={null}>
          <Busca base="/imoveis" placeholder="Buscar por unidade, matrícula ou empreendimento" />
        </Suspense>

        {admin && (incorporadoras?.length ?? 0) > 0 ? (
          <Suspense fallback={null}>
            <FiltroIncorporadora incorporadoras={incorporadoras ?? []} base="/imoveis" />
          </Suspense>
        ) : null}

        {buscando ? (
          <span className="text-sm text-trilha-400">
            {data?.length ?? 0} resultado{(data?.length ?? 0) === 1 ? "" : "s"} para “{termo}”
          </span>
        ) : null}

        {filtrando || buscando ? (
          <Link
            href="/imoveis"
            className="font-display text-sm font-semibold tracking-wide text-trilha-500 uppercase underline underline-offset-2 hover:text-trilha-700"
          >
            Limpar
          </Link>
        ) : null}
      </div>

      {semEmpreendimento ? (
        <EmptyState
          titulo="Cadastre um empreendimento primeiro"
          texto="Todo imóvel pertence a um empreendimento, que por sua vez pertence a uma incorporadora. É essa ordem que garante que nenhum imóvel fique sem dono."
          acao={edita ? { href: "/empreendimentos/novo", label: "Cadastrar empreendimento" } : undefined}
        />
      ) : !data || data.length === 0 ? (
        <EmptyState
          titulo={
            buscando
              ? "Nenhum imóvel encontrado"
              : filtrando
                ? "Nenhum imóvel desta incorporadora"
                : "Nenhum imóvel cadastrado"
          }
          texto={
            buscando
              ? `Nada corresponde a “${termo}”. Tente a identificação da unidade, a matrícula ou o nome do empreendimento.`
              : filtrando
                ? "Essa incorporadora ainda não tem unidades cadastradas."
                : "Todo imóvel nasce dentro de um empreendimento. Escolha um para cadastrar as unidades."
          }
          acao={edita ? { href: "/empreendimentos", label: "Cadastrar imóvel" } : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-trilha-200 bg-white">
          <table className="w-full min-w-[860px] border-collapse text-left">
            <thead>
              <tr className="border-b border-trilha-100">
                {[
                  "Imóvel",
                  "Empreendimento",
                  ...(admin ? ["Incorporadora"] : []),
                  "Características",
                  "Valor",
                  "Status",
                  "Cadastrado em",
                  "",
                ].map((h, i) => (
                  <th
                    key={`${h}-${i}`}
                    className="font-display px-5 py-3 text-sm font-semibold tracking-wide text-trilha-400 uppercase"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((linha) => (
                <tr key={linha.id} className="border-b border-trilha-100 last:border-0">
                  <td className="px-5 py-4">
                    {linha.empreendimento ? (
                      <Link
                        href={`/empreendimentos/${linha.empreendimento.id}/imoveis/${linha.id}`}
                        className="font-display text-[17px] font-semibold text-trilha-700 underline underline-offset-2 hover:text-trilha-500"
                      >
                        {linha.identificacao}
                      </Link>
                    ) : (
                      <span className="font-display text-[17px] font-semibold text-trilha-700">
                        {linha.identificacao}
                      </span>
                    )}
                    <span className="block text-sm text-trilha-400">
                      {imovelTipoLabel(linha.tipo)}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-[15px]">{linha.empreendimento?.nome ?? "—"}</td>
                  {admin ? (
                    <td className="px-5 py-4 text-[15px]">
                      {linha.empreendimento?.incorporadora_id ? (
                        <Link
                          href={`/incorporadoras/${linha.empreendimento.incorporadora_id}`}
                          className="text-trilha-500 underline underline-offset-2 hover:text-trilha-700"
                        >
                          {linha.empreendimento.incorporadora?.nome ?? "—"}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                  ) : null}
                  <td className="px-5 py-4 text-[15px] text-trilha-400">
                    {[
                      linha.num_quartos ? `${linha.num_quartos} dorm.` : null,
                      linha.num_vagas ? `${linha.num_vagas} vaga(s)` : null,
                      linha.metros_quadrados ? formatArea(linha.metros_quadrados) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </td>
                  <td className="px-5 py-4 text-[15px] tabular-nums text-trilha-900">
                    {formatBRL(linha.valor)}
                    {linha.valor !== null ? (
                      <span className="block text-sm text-trilha-400">
                        {formatBRL(valorReajustado(linha.valor))} em {PRAZO_PADRAO_MESES} meses
                      </span>
                    ) : null}
                  </td>
                  <td className="px-5 py-4">
                    <StatusPill status={linha.status} label={imovelStatusLabel(linha.status)} />
                  </td>
                  <td className="px-5 py-4 text-[15px] tabular-nums text-trilha-400">
                    {dataCurta(linha.created_at)}
                  </td>
                  <td className="px-5 py-4 text-right">
                    {linha.empreendimento ? (
                      <Link
                        href={`/empreendimentos/${linha.empreendimento.id}/imoveis/${linha.id}`}
                        className="font-display text-sm font-semibold tracking-wide text-trilha-500 uppercase underline underline-offset-2 hover:text-trilha-700"
                      >
                        Abrir
                      </Link>
                    ) : null}
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
