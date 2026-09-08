import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessao } from "@/lib/sessao";
import { EmptyState, PageHeader } from "@/components/ui";
import { ImportarEstoque } from "@/components/importar-estoque";

type Linha = {
  id: string;
  arquivo_nome: string | null;
  status: string;
  created_at: string;
  incorporadora: { nome: string } | null;
  empreendimento: { nome: string } | null;
  importacao_linha: { count: number }[];
};

const ROTULO: Record<string, string> = {
  processando: "Processando",
  aguardando_revisao: "Aguardando conferência",
  aplicada: "Aplicada",
  descartada: "Descartada",
  erro: "Erro na leitura",
};

const COR: Record<string, string> = {
  aguardando_revisao: "border-amber-200 bg-amber-50 text-amber-700",
  aplicada: "border-emerald-200 bg-emerald-50 text-emerald-700",
  erro: "border-red-200 bg-red-50 text-red-700",
  descartada: "border-slate-200 bg-slate-100 text-slate-600",
  processando: "border-trilha-200 bg-trilha-50 text-trilha-700",
};

/**
 * Esta página hospeda o envio do arquivo, e o envio espera a IA ler o PDF —
 * o que leva de segundos a mais de meio minuto.
 *
 * Na Vercel toda função tem tempo máximo, e o padrão é curto demais para
 * isso: sem esta linha o upload é cortado no meio da leitura, e o usuário vê
 * um erro genérico sem entender que o arquivo estava bem.
 *
 * 60 s é o teto do plano Hobby. Se um dia isso não bastar, a saída não é
 * aumentar o número: é tirar a leitura de dentro da requisição — responder na
 * hora com "processando" e deixar a IA rodar depois, com a tela consultando o
 * resultado.
 */
export const maxDuration = 60;

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export default async function ImportacoesPage() {
  const sessao = await getSessao();
  if (sessao?.conta && sessao.conta.tipo !== "trilha_admin") redirect("/empreendimentos");

  const supabase = await createClient();

  const { data: incorporadoras } = await supabase
    .from("incorporadora")
    .select("id, nome")
    .order("nome")
    .returns<{ id: string; nome: string }[]>();

  const { data } = await supabase
    .from("importacao")
    .select(
      `id, arquivo_nome, status, created_at,
       incorporadora (nome), empreendimento (nome), importacao_linha(count)`,
    )
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<Linha[]>();

  return (
    <>
      <PageHeader
        titulo="Importação de estoque"
        descricao="Cadastre as unidades de uma incorporadora a partir da tabela que ela mandou."
      />

      {(incorporadoras?.length ?? 0) > 0 ? (
        <ImportarEstoque incorporadoras={incorporadoras ?? []} />
      ) : (
        <EmptyState
          titulo="Cadastre uma incorporadora primeiro"
          texto="A lista de estoque é sempre de alguém: o arquivo entra vinculado a uma incorporadora."
          acao={{ href: "/incorporadoras/nova", label: "Cadastrar incorporadora" }}
        />
      )}

      <h2 className="font-display mb-4 text-xl font-semibold text-trilha-700">Envios anteriores</h2>

      {!data || data.length === 0 ? (
        <p className="rounded-lg border border-dashed border-trilha-200 bg-white px-5 py-8 text-center text-[15px] text-trilha-400">
          Nenhum arquivo enviado ainda.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-trilha-200 bg-white">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead>
              <tr className="border-b border-trilha-100">
                {["Arquivo", "Incorporadora", "Empreendimento", "Unidades", "Situação", "Enviado em"].map(
                  (h) => (
                    <th
                      key={h}
                      className="font-display px-5 py-3 text-sm font-semibold tracking-wide text-trilha-400 uppercase"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {data.map((linha) => (
                <tr key={linha.id} className="border-b border-trilha-100 last:border-0">
                  <td className="px-5 py-4">
                    <Link
                      href={`/importacao/${linha.id}`}
                      className="font-display text-[16px] font-semibold text-trilha-700 underline underline-offset-2 hover:text-trilha-500"
                    >
                      {linha.arquivo_nome ?? "sem nome"}
                    </Link>
                  </td>
                  <td className="px-5 py-4 text-[15px]">{linha.incorporadora?.nome ?? "—"}</td>
                  <td className="px-5 py-4 text-[15px] text-trilha-400">
                    {linha.empreendimento?.nome ?? "—"}
                  </td>
                  <td className="px-5 py-4 text-[15px] tabular-nums">
                    {linha.importacao_linha?.[0]?.count ?? 0}
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`font-display inline-block rounded-full border px-2.5 py-0.5 text-sm font-semibold ${
                        COR[linha.status] ?? "border-trilha-200 bg-trilha-50 text-trilha-700"
                      }`}
                    >
                      {ROTULO[linha.status] ?? linha.status}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-sm tabular-nums text-trilha-400">
                    {dataHora(linha.created_at)}
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
