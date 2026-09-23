import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ehAdmin, ehParceiro, getSessao } from "@/lib/sessao";
import { EmptyState, PageHeader } from "@/components/ui";
import ErroLeitura from "@/components/erro-leitura";
import { NOME_DO_ATOR, bolaCom, diasParado, progresso, type Tarefa } from "@/lib/fechamento";

/**
 * Os negócios em fechamento.
 *
 * Uma rota só para os três perfis. Quem vê o quê não é decidido aqui: a Trilha
 * enxerga todos, a incorporadora os das unidades dela, o corretor os que ele
 * vendeu — e isso está nas policies. Uma tela, três recortes, nenhum `if`.
 *
 * A coluna que importa é **de quem é a bola**, não o percentual. Fechamento
 * com 18 de 20 tarefas mostra 90% e pode estar parado há três semanas.
 */
export const dynamic = "force-dynamic";

type LinhaNegocio = {
  id: string;
  status: string;
  created_at: string;
  proposta: { codigo: string } | null;
  imovel: { identificacao: string } | null;
  empreendimento: { nome: string } | null;
  incorporadora: { nome: string } | null;
  parceiro: { nome: string } | null;
};

const ROTULO_STATUS: Record<string, string> = {
  em_fechamento: "Em fechamento",
  em_jornada: "Em jornada",
  em_quitacao: "Em quitação",
  quitado: "Quitado",
  cancelado: "Cancelado",
};

export default async function NegociosPage() {
  const sessao = await getSessao();
  const admin = ehAdmin(sessao);
  const corretor = ehParceiro(sessao);

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("negocio")
    .select(
      `id, status, created_at,
       proposta (codigo),
       imovel (identificacao),
       empreendimento (nome),
       incorporadora (nome),
       parceiro (nome)`,
    )
    .order("created_at", { ascending: false })
    .returns<LinhaNegocio[]>();

  if (error) return <ErroLeitura oQue="dos negócios" erro={error} />;

  const negocios = data ?? [];

  // As tarefas de todos de uma vez: o andamento é conta sobre elas, e uma
  // consulta por linha seria N idas ao banco para montar uma tabela.
  const { data: tarefas } = negocios.length
    ? await supabase
        .from("checklist_item")
        .select(
          `id, negocio_id, etapa, etapa_ordem, ordem, titulo, ator, tipo,
           exige_validade, interna, status, arquivo_path, referencia_externa,
           observacao, emitido_em, valido_ate, concluido_em`,
        )
        .in(
          "negocio_id",
          negocios.map((n) => n.id),
        )
        .returns<(Tarefa & { negocio_id: string })[]>()
    : { data: [] as (Tarefa & { negocio_id: string })[] };

  const porNegocio = new Map<string, Tarefa[]>();
  for (const t of tarefas ?? []) {
    const lista = porNegocio.get(t.negocio_id);
    if (lista) lista.push(t);
    else porNegocio.set(t.negocio_id, [t]);
  }

  return (
    <>
      <PageHeader
        titulo="Setups de negócios"
        descricao={
          corretor
            ? "As unidades que você vendeu, e o que falta para fechar cada uma."
            : "Unidades com proposta aceita, em processo de fechamento."
        }
      />

      {negocios.length === 0 ? (
        <EmptyState
          titulo="Nenhum negócio ainda"
          texto="Um negócio nasce quando a Trilha aceita uma proposta. A partir daí, cada parte faz a sua parte do fechamento aqui."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
          <table className="w-full min-w-[900px] border-collapse text-left">
            <thead>
              <tr className="border-b border-border">
                {["Unidade", admin ? "Incorporadora" : "Corretor", "Esperando", "Andamento", "Situação"].map(
                  (h) => (
                    <th
                      key={h}
                      className="bg-muted/50 px-4 py-2.5 text-xs font-medium whitespace-nowrap text-muted-foreground"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {negocios.map((n) => {
                const lista = porNegocio.get(n.id) ?? [];
                const esperando = bolaCom(lista);
                const pct = progresso(lista);
                const dias = diasParado(lista, n.created_at);

                return (
                  <tr key={n.id} className="border-b border-border transition-colors last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <Link
                        href={`/negocios/${n.id}`}
                        className="text-sm font-semibold text-foreground underline-offset-4 hover:underline hover:text-foreground"
                      >
                        {n.imovel?.identificacao ?? "—"}
                      </Link>
                      <span className="block text-sm text-muted-foreground">
                        {n.empreendimento?.nome ?? "—"}
                        {n.proposta ? ` · ${n.proposta.codigo}` : ""}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {admin ? (n.incorporadora?.nome ?? "—") : (n.parceiro?.nome ?? "—")}
                    </td>

                    <td className="px-4 py-3 text-sm">
                      {esperando.length === 0 ? (
                        <span className="text-emerald-700">nada — tudo feito</span>
                      ) : (
                        <>
                          <span className="font-semibold text-foreground">
                            {esperando.map((a) => NOME_DO_ATOR[a]).join(" e ")}
                          </span>
                          <span className="block text-sm text-muted-foreground">
                            {dias === 0 ? "hoje" : `há ${dias} dia(s)`}
                          </span>
                        </>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <Barra pct={pct} />
                    </td>

                    <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                      {ROTULO_STATUS[n.status] ?? n.status}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Barra({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-destaque" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm tabular-nums text-muted-foreground">{pct}%</span>
    </div>
  );
}
