import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { ehAdmin, getSessao } from "@/lib/sessao";
import { maskCPF, maskPhone } from "@/lib/br";
import { PageHeader } from "@/components/ui";
import FormProprietario, { PROPRIETARIO_VAZIO } from "@/components/form-proprietario";
import { lerProprietario, paraFormulario } from "@/lib/proprietario";

export default async function EditarProprietarioPage({ params }: { params: Promise<{ id: string }> }) {
  const sessao = await getSessao();
  if (!ehAdmin(sessao)) redirect("/");

  const { id } = await params;
  const data = await lerProprietario(createAdminClient(), id);
  if (!data) notFound();

  return (
    <>
      <PageHeader titulo="Editar dados" descricao={data.resp_nome} voltar={{ href: `/proprietarios/${id}`, label: data.resp_nome }} />
      <FormProprietario modo="editar" id={id} inicial={{ ...PROPRIETARIO_VAZIO, ...paraFormulario(data, maskCPF, maskPhone) }} />
    </>
  );
}
