import { redirect } from "next/navigation";
import { ehParceiro, getSessao } from "@/lib/sessao";
import { PageHeader } from "@/components/ui";
import FormParceiro from "@/components/form-parceiro";

export default async function NovoParceiroPage() {
  const sessao = await getSessao();
  if (sessao?.conta?.tipo === "trilha_admin") redirect("/incorporadoras");
  if (ehParceiro(sessao)) redirect("/empreendimentos");

  if (!sessao?.incorporadoraId) {
    return (
      <p className="rounded-md border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
        Esta conta não está ligada a nenhuma incorporadora.
      </p>
    );
  }

  return (
    <>
      <PageHeader
        titulo="Cadastrar parceiro"
        descricao="Ele vai enxergar as suas unidades disponíveis, sem poder alterar nada."
        voltar={{ href: "/parceiros", label: "Parceiros" }}
      />
      <FormParceiro
        modo="criar"
        incorporadoraId={sessao.incorporadoraId}
        voltarPara="/parceiros"
      />
    </>
  );
}
