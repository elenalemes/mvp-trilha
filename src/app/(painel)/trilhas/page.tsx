import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ehAdmin, ehParceiro, getSessao } from "@/lib/sessao";
import { formatBRL } from "@/lib/br";
import { dataBR, jornada, rotuloJornada } from "@/lib/jornada";
import { EmptyState, PageHeader } from "@/components/ui";
import ErroLeitura from "@/components/erro-leitura";

/**
 * As trilhas: os negócios que terminaram o fechamento e estão na jornada.
 *
 * Um negócio vira trilha sozinho, quando a última tarefa do checklist fecha —
 * quem faz a passagem é um gatilho no banco (`negocio-vira-trilha.sql`), não
 * esta tela. Aqui só se lê.
 *
 * Uma rota, três recortes, nenhum `if` de permissão: a Trilha enxerga todas, a
 * incorporadora as unidades dela, o corretor as que ele vendeu. Quem decide
 * são as policies de `negocio`, como em Setups de negócios.
 *
 * O COMPRADOR é o ponto sensível. A incorporadora não tem policy nenhuma em
 * `comprador` — o embed volta nulo para ela, e é por isso que a coluna só
 * existe para a Trilha e para o corretor. Não é a tela escondendo: é o banco
 * não entregando, e a tela não fingindo que entregou.
 */
export const dynamic = "force-dynamic";

const EM_JORNADA = ["em_jornada", "em_quitacao", "quitado"];

const ROTULO_STATUS: Record<string, string> = {
  em_jornada: "Ativa",
  em_quitacao: "Em quitação",
  quitado: "Quitada",
};

type LinhaTrilha = {
  id: string;
  status: string;
  jornada_inicio: string | null;
  parceiro_id: string | null;
  proposta: { codigo: string; prazo_meses: number; valor_parcela: number } | null;
  imovel: { identificacao: string } | null;
  empreendimento: { nome: string } | null;
  incorporadora: { nome: string; tipo: string } | null;
  parceiro: { nome: string } | null;
  comprador: { nome: string } | null;
};

export default async function TrilhasPage() {
  const sessao = await getSessao();
  const admin = ehAdmin(sessao);
  const corretor = ehParceiro(sessao);

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("negocio")
    .select(
      `id, status, jornada_inicio, parceiro_id,
       proposta (codigo, prazo_meses, valor_parcela),
       imovel (identificacao),
       empreendimento (nome),
       incorporadora (nome, tipo),
       parceiro (nome),
       comprador (nome)`,
    )
    .in("status", EM_JORNADA)
    .order("jornada_inicio", { ascending: false })
    .returns<LinhaTrilha[]>();

  if (error) return <ErroLeitura oQue="das trilhas" erro={error} />;

  const trilhas = data ?? [];

  // A segunda coluna é quem interessa a quem está olhando: a Trilha quer saber
  // de quem é a unidade, a incorporadora quem vendeu, e o corretor já sabe as
  // duas coisas — para ele o que falta é o nome do comprador.
  const colunas = [
    "Unidade",
    admin ? "Vendedor" : corretor ? "Comprador" : "Corretor",
    ...(admin ? ["Comprador"] : []),
    "Jornada",
    "Parcela",
    "Situação",
  ];

  return (
    <>
      <PageHeader
        titulo="Trilhas"
        descricao={
          corretor
            ? "As unidades que você vendeu e já estão em jornada."
            : "Negócios fechados, com o comprador morando e pagando a entrada."
        }
      />

      {trilhas.length === 0 ? (
        <EmptyState
          titulo="Nenhuma trilha ainda"
          texto="Um negócio vira trilha sozinho quando a última tarefa do fechamento é concluída. Até lá ele fica em Setups de negócios."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
          <table className="w-full min-w-[900px] border-collapse text-left">
            <thead>
              <tr className="border-b border-border">
                {colunas.map((h) => (
                  <th
                    key={h}
                    className="bg-muted/50 px-4 py-2.5 text-xs font-medium whitespace-nowrap text-muted-foreground"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {trilhas.map((t) => {
                // Sem proposta ou sem data não há jornada para contar. Não
                // deveria acontecer; se acontecer, a linha aparece assim mesmo,
                // porque sumir com ela esconderia o problema.
                const j =
                  t.jornada_inicio && t.proposta
                    ? jornada(t.jornada_inicio, t.proposta.prazo_meses)
                    : null;

                return (
                  <tr
                    key={t.id}
                    className="border-b border-border transition-colors last:border-0 hover:bg-muted/40"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/trilhas/${t.id}`}
                        className="text-sm font-semibold text-foreground underline-offset-4 hover:underline hover:text-foreground"
                      >
                        {t.imovel?.identificacao ?? "—"}
                      </Link>
                      <span className="block text-sm text-muted-foreground">
                        {t.empreendimento?.nome ?? "—"}
                        {t.proposta ? ` · ${t.proposta.codigo}` : ""}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {admin
                        ? `${t.incorporadora?.nome ?? "—"}${t.incorporadora?.tipo === "proprietario_pf" ? " · Proprietário PF" : ""}`
                        : corretor
                          ? (t.comprador?.nome ?? "—")
                          : t.parceiro_id
                            ? (t.parceiro?.nome ?? "—")
                            : "Venda direta"}
                    </td>

                    {admin ? (
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {t.comprador?.nome ?? "—"}
                      </td>
                    ) : null}

                    <td className="px-4 py-3 text-sm">
                      {j ? (
                        <>
                          <span className="font-medium text-foreground">{rotuloJornada(j)}</span>
                          <span className="block text-sm text-muted-foreground tabular-nums">
                            até {dataBR(j.fim)}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-sm tabular-nums text-muted-foreground">
                      {t.proposta ? formatBRL(t.proposta.valor_parcela) : "—"}
                    </td>

                    <td className="px-4 py-3 text-sm whitespace-nowrap text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          aria-hidden="true"
                          className={`size-1.5 rounded-full ${t.status === "quitado" ? "bg-sucesso" : t.status === "em_quitacao" ? "bg-aviso" : "bg-destaque"}`}
                        />
                        {ROTULO_STATUS[t.status] ?? t.status}
                      </span>
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
