import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessao, podeEditar } from "@/lib/sessao";
import { PageHeader } from "@/components/ui";
import FormEmpreendimento from "@/components/form-empreendimento";

type Registro = { id: string; nome: string; endereco: string | null; incorporadora_id: string };

export default async function EditarEmpreendimentoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sessao = await getSessao();
  if (!podeEditar(sessao)) redirect("/empreendimentos");
  const admin = sessao?.conta?.tipo === "trilha_admin";

  const supabase = await createClient();

  const { data } = await supabase
    .from("empreendimento")
    .select("id, nome, endereco, incorporadora_id")
    .eq("id", id)
    .maybeSingle<Registro>();

  if (!data) notFound();

  const { data: incorporadoras } = await supabase
    .from("incorporadora")
    .select("id, nome")
    // Proprietário PF tem menu próprio.
    .eq("tipo", "incorporadora")
    .order("nome")
    .returns<{ id: string; nome: string }[]>();

  return (
    <>
      <PageHeader
        titulo="Editar empreendimento"
        descricao={data.nome}
        voltar={{ href: "/empreendimentos", label: "Empreendimentos" }}
      />
      <FormEmpreendimento
        modo="editar"
        id={id}
        incorporadoras={incorporadoras ?? []}
        admin={admin}
        inicial={{
          incorporadora_id: data.incorporadora_id,
          nome: data.nome,
          endereco: data.endereco ?? "",
        }}
      />
    </>
  );
}
