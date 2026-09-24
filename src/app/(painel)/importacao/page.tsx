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
  aguardando_revisao: "border-aviso/20 bg-aviso-suave text-aviso",
  aplicada: "border-sucesso/20 bg-sucesso-suave text-sucesso",
  erro: "border-destructive/20 bg-erro-suave text-destructive",
  descartada: "border-border bg-muted text-muted-foreground",
  processando: "border-border bg-muted/50 text-foreground",
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
    // Proprietário PF tem menu próprio.
    .eq("tipo", "incorporadora")
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
        descricao="Cadastre unidades a partir da tabela da incorporadora."
      />

      {(incorporadoras?.length ?? 0) > 0 ? (
        <ImportarEstoque incorporadoras={incorporadoras ?? []} />
      ) : (
        <EmptyState
          titulo="Cadastre uma incorporadora primeiro"
          texto="Cadastre uma incorporadora primeiro."
          acao={{ href: "/incorporadoras/nova", label: "Cadastrar incorporadora" }}
        />
      )}

      <h2 className="mb-4 text-xl font-semibold text-foreground">Envios anteriores</h2>

      {!data || data.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-card px-5 py-8 text-center text-sm text-muted-foreground">
          Nenhum arquivo enviado ainda.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead>
              <tr className="border-b border-border">
                {["Arquivo", "Incorporadora", "Empreendimento", "Unidades", "Situação", "Enviado em"].map(
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
              {data.map((linha) => (
                <tr key={linha.id} className="border-b border-border transition-colors last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <Link
                      href={`/importacao/${linha.id}`}
                      className="text-[16px] font-semibold text-foreground underline-offset-4 hover:underline hover:text-foreground"
                    >
                      {linha.arquivo_nome ?? "sem nome"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm">{linha.incorporadora?.nome ?? "—"}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {linha.empreendimento?.nome ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-sm tabular-nums">
                    {linha.importacao_linha?.[0]?.count ?? 0}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full border px-2.5 py-0.5 text-sm font-semibold ${
                        COR[linha.status] ?? "border-border bg-muted/50 text-foreground"
                      }`}
                    >
                      {ROTULO[linha.status] ?? linha.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm tabular-nums text-muted-foreground">
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
