import { redirect } from "next/navigation";
import { ehAdmin, getSessao } from "@/lib/sessao";
import { PageHeader } from "@/components/ui";
import FormParceiro from "@/components/form-parceiro";

export default async function NovoParceiroTrilhaPage() {
  const sessao = await getSessao();
  if (!ehAdmin(sessao)) redirect("/");

  return (
    <>
      <PageHeader
        titulo="Cadastrar Parceiro Trilha"
        descricao="Corretor independente, sem vínculo com incorporadora."
        voltar={{ href: "/parceiro-trilha", label: "Parceiro Trilha" }}
      />
      {/* Sem incorporadora: é isso que faz dele um Parceiro Trilha. */}
      <FormParceiro modo="criar" incorporadoraId={null} voltarPara="/parceiro-trilha" />
    </>
  );
}
