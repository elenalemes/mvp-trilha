import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessao } from "@/lib/sessao";
import { PageHeader } from "@/components/ui";
import FormParceiro from "@/components/form-parceiro";

export default async function NovoParceiroPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const sessao = await getSessao();
  if (sessao?.conta && sessao.conta.tipo !== "trilha_admin") redirect("/empreendimentos");

  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("incorporadora")
    .select("nome")
    .eq("id", id)
    .maybeSingle<{ nome: string }>();

  if (!data) notFound();

  return (
    <>
      <PageHeader
        titulo="Cadastrar parceiro"
        descricao={data.nome}
        voltar={{ href: `/incorporadoras/${id}/parceiros`, label: "Parceiros" }}
      />
      <FormParceiro
        modo="criar"
        incorporadoraId={id}
        voltarPara={`/incorporadoras/${id}/parceiros`}
      />
    </>
  );
}
