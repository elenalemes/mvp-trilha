import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ehAdmin, getSessao } from "@/lib/sessao";
import { PageHeader } from "@/components/ui";
import FormAcesso from "@/app/(painel)/incorporadoras/[id]/acesso/form";

export default async function AcessoProprietarioPage({ params }: { params: Promise<{ id: string }> }) {
  const sessao = await getSessao();
  if (!ehAdmin(sessao)) redirect("/");

  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("incorporadora")
    .select("resp_nome, conta_id, conta(email)")
    .eq("id", id)
    .eq("tipo", "proprietario_pf")
    .maybeSingle<{ resp_nome: string; conta_id: string | null; conta: { email: string | null } | null }>();
  if (!data) notFound();

  return (
    <>
      <PageHeader titulo="Dados de acesso" descricao={data.resp_nome} voltar={{ href: `/proprietarios/${id}`, label: data.resp_nome }} />
      {data.conta_id ? (
        <FormAcesso id={id} emailAtual={data.conta?.email ?? ""} voltarPara={`/proprietarios/${id}`} />
      ) : (
        <p className="rounded-md border border-aviso/20 bg-aviso-suave px-5 py-4 text-sm text-aviso">
          Este proprietário ainda não tem acesso criado.
        </p>
      )}
    </>
  );
}
