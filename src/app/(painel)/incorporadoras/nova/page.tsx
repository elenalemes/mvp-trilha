import { redirect } from "next/navigation";
import { getSessao } from "@/lib/sessao";
import { PageHeader } from "@/components/ui";
import FormIncorporadora from "@/components/form-incorporadora";

export default async function NovaIncorporadoraPage() {
  const sessao = await getSessao();
  if (sessao?.conta && sessao.conta.tipo !== "trilha_admin") redirect("/empreendimentos");

  return (
    <>
      <PageHeader
        titulo="Cadastrar incorporadora"
        voltar={{ href: "/incorporadoras", label: "Incorporadoras" }}
      />
      <FormIncorporadora modo="criar" />
    </>
  );
}
