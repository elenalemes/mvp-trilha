import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessao } from "@/lib/sessao";
import { PageHeader } from "@/components/ui";
import FormAcesso from "./form";

type Registro = {
  nome: string;
  conta_id: string | null;
  conta: { email: string | null } | null;
};


/**
 * "Não existe" e "não consigo ler" são coisas diferentes, e confundir as duas
 * já custou rodadas de conserto no lugar errado nesta base. Erro do banco vira
 * mensagem na tela com código e motivo; ausência de linha vira 404.
 */
function ErroDeLeitura({ erro }: { erro: { code?: string; message?: string } }) {
  return (
    <div className="rounded-lg border border-destructive/20 bg-erro-suave px-5 py-4">
      <p className="text-sm font-semibold text-destructive">
        Não consegui carregar os dados desta incorporadora.
      </p>
      <p className="mt-1 text-sm text-destructive">
        {erro.code ?? "sem código"}: {erro.message ?? "sem mensagem"}
      </p>
      <p className="mt-2 text-sm text-destructive">
        Recarregue a página. Se continuar, envie este código para a Trilha.
      </p>
    </div>
  );
}

export default async function AcessoPage({ params }: { params: Promise<{ id: string }> }) {
  const sessao = await getSessao();
  if (sessao?.conta && sessao.conta.tipo !== "trilha_admin") redirect("/empreendimentos");

  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("incorporadora")
    .select("nome, conta_id, conta(email)")
    .eq("id", id)
    .maybeSingle<Registro>();

  if (error) return <ErroDeLeitura erro={error} />;
  if (!data) notFound();

  return (
    <>
      <PageHeader
        titulo="Dados de acesso"
        descricao={data.nome}
        voltar={{ href: `/incorporadoras/${id}`, label: "Voltar para a ficha" }}
      />

      {data.conta_id ? (
        <FormAcesso id={id} emailAtual={data.conta?.email ?? ""} />
      ) : (
        <p className="rounded-md border border-aviso/20 bg-aviso-suave px-5 py-4 text-sm text-aviso">
          Esta incorporadora ainda não tem acesso criado.
        </p>
      )}
    </>
  );
}
