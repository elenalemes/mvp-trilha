import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessao } from "@/lib/sessao";
import { calcularPlano, type LinhaImportacao } from "@/lib/importacao/plano";
import { PageHeader } from "@/components/ui";
import { Revisao } from "./revisao";

type Importacao = {
  id: string;
  incorporadora_id: string;
  empreendimento_id: string | null;
  arquivo_nome: string | null;
  metodo_leitura: string | null;
  contexto: string | null;
  empreendimento_detectado: string | null;
  endereco_detectado: string | null;
  status: string;
  erro: string | null;
  created_at: string;
  incorporadora: { nome: string } | null;
};

export default async function ImportacaoPage({ params }: { params: Promise<{ id: string }> }) {
  const sessao = await getSessao();
  if (sessao?.conta && sessao.conta.tipo !== "trilha_admin") redirect("/empreendimentos");

  const { id } = await params;
  const supabase = await createClient();

  const { data: importacao } = await supabase
    .from("importacao")
    .select(
      `id, incorporadora_id, empreendimento_id, arquivo_nome, metodo_leitura, contexto,
       empreendimento_detectado, endereco_detectado, status, erro, created_at,
       incorporadora (nome)`,
    )
    .eq("id", id)
    .maybeSingle<Importacao>();

  if (!importacao) notFound();

  // --- estados que não chegam na revisão ---

  if (importacao.status === "erro") {
    const ocupada = (importacao.erro ?? "").startsWith("OCUPADA|");
    const detalhe = ocupada ? (importacao.erro ?? "").slice(8) : importacao.erro;

    return (
      <>
        <PageHeader
          titulo={ocupada ? "A IA está congestionada" : "Não deu para ler este arquivo"}
          descricao={importacao.arquivo_nome ?? undefined}
          voltar={{ href: "/incorporadoras", label: "Início" }}
        />

        {ocupada ? (
          <div className="rounded-lg border border-aviso/20 bg-aviso-suave p-6">
            <p className="text-sm text-aviso">
              O seu arquivo está bem — quem não respondeu foi o Google. O plano gratuito do Gemini
              fica indisponível quando há muita gente usando, e isso costuma passar em alguns
              minutos.
            </p>
            <p className="mt-3 text-sm text-aviso">
              <strong>O que fazer:</strong> envie o arquivo de novo daqui a pouco. Se acontecer
              com frequência, vale trocar para uma chave paga — o custo é de centavos por arquivo
              e não tem fila.
            </p>
            <p className="mt-4 font-mono text-xs break-all text-aviso">{detalhe}</p>
          </div>
        ) : (
          <div className="rounded-lg border border-destructive/20 bg-erro-suave p-6">
            <p className="text-sm text-destructive">{detalhe}</p>
            <p className="mt-3 text-sm text-destructive">
              Se o arquivo estiver num formato que não dá para ler, o caminho é cadastrar as
              unidades à mão pelo empreendimento.
            </p>
          </div>
        )}
      </>
    );
  }

  if (importacao.status === "aplicada") {
    return (
      <>
        <PageHeader
          titulo="Importação já aplicada"
          descricao={importacao.arquivo_nome ?? undefined}
          voltar={{ href: "/incorporadoras", label: "Início" }}
          acao={
            importacao.empreendimento_id
              ? { href: `/empreendimentos/${importacao.empreendimento_id}`, label: "Ver empreendimento" }
              : undefined
          }
        />
        <p className="rounded-lg border border-sucesso/20 bg-sucesso-suave px-5 py-4 text-sm text-sucesso">
          As unidades deste arquivo já foram gravadas.
        </p>
      </>
    );
  }

  // --- revisão ---

  const { data: linhas } = await supabase
    .from("importacao_linha")
    .select("*")
    .eq("importacao_id", id)
    .order("ordem")
    .returns<LinhaImportacao[]>();

  const { data: empreendimentos } = await supabase
    .from("empreendimento")
    .select("id, nome")
    .eq("incorporadora_id", importacao.incorporadora_id)
    .order("nome")
    .returns<{ id: string; nome: string }[]>();

  const plano = importacao.empreendimento_id
    ? await calcularPlano(supabase, importacao.empreendimento_id, linhas ?? [])
    : null;

  return (
    <>
      <PageHeader
        titulo="Conferir importação"
        descricao={`${importacao.incorporadora?.nome ?? ""} · ${importacao.arquivo_nome ?? ""}`}
        voltar={{ href: "/incorporadoras", label: "Início" }}
      />

      <div className="mb-6 flex flex-wrap items-center gap-3 text-sm">
        <span
          className={`rounded-full border px-3 py-1 font-semibold ${
            importacao.metodo_leitura === "documento"
              ? "border-aviso/20 bg-aviso-suave text-aviso"
              : "border-sucesso/20 bg-sucesso-suave text-sucesso"
          }`}
        >
          {importacao.metodo_leitura === "documento"
            ? "Lido como documento · valores interpretados por IA"
            : "Lido como planilha · valores extraídos direto"}
        </span>
        <span className="text-muted-foreground">
          {importacao.metodo_leitura === "documento"
            ? "Confira com atenção."
            : "Confiança alta, mas passe o olho."}
        </span>
      </div>

      {importacao.contexto ? (
        <p className="mb-6 rounded-md border border-border bg-muted/50 px-4 py-3 text-sm text-foreground">
          <span className="font-semibold">Observação enviada com o arquivo:</span>{" "}
          {importacao.contexto}
        </p>
      ) : null}

      {(linhas?.length ?? 0) === 0 ? (
        <p className="rounded-lg border border-aviso/20 bg-aviso-suave px-5 py-4 text-sm text-aviso">
          Nenhuma unidade com preço foi encontrada neste arquivo.{" "}
          <Link href="/incorporadoras" className="underline">
            Voltar
          </Link>
        </p>
      ) : (
        <Revisao
          importacaoId={id}
          empreendimentoId={importacao.empreendimento_id}
          empreendimentoDetectado={importacao.empreendimento_detectado}
          enderecoDetectado={importacao.endereco_detectado}
          empreendimentos={empreendimentos ?? []}
          linhas={linhas ?? []}
          plano={plano}
        />
      )}
    </>
  );
}
