import { redirect } from "next/navigation";
import { ehAdmin, getSessao } from "@/lib/sessao";
import { PageHeader } from "@/components/ui";
import FormProprietario from "@/components/form-proprietario";

export default async function NovoProprietarioPage() {
  const sessao = await getSessao();
  if (!ehAdmin(sessao)) redirect("/");

  return (
    <>
      <PageHeader titulo="Cadastrar proprietário" voltar={{ href: "/proprietarios", label: "Proprietários PF" }} />
      <FormProprietario modo="criar" />
    </>
  );
}
