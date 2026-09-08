import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ehParceiro, getSessao } from "@/lib/sessao";
import { PageHeader } from "@/components/ui";
import ErroLeitura from "@/components/erro-leitura";
import FormAcessoParceiro from "@/components/form-acesso-parceiro";

type Registro = {
  nome: string;
  conta_id: string | null;
  conta: { email: string | null } | null;
};

export default async function AcessoMeuParceiroPage({
  params,
}: {
  params: Promise<{ parceiroId: string }>;
}) {
  const sessao = await getSessao();
  if (sessao?.conta?.tipo === "trilha_admin") redirect("/incorporadoras");
  if (ehParceiro(sessao)) redirect("/empreendimentos");

  const { parceiroId } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("parceiro")
    .select("nome, conta_id, conta (email)")
    .eq("id", parceiroId)
    .maybeSingle<Registro>();

  if (error) return <ErroLeitura oQue="deste parceiro" erro={error} />;
  if (!data) notFound();

  return (
    <>
      <PageHeader
        titulo="Dados de acesso"
        descricao={data.nome}
        voltar={{ href: "/parceiros", label: "Parceiros" }}
      />

      {data.conta_id ? (
        <FormAcessoParceiro
          id={parceiroId}
          emailAtual={data.conta?.email ?? ""}
          voltarPara="/parceiros"
        />
      ) : (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          Este parceiro ainda não tem acesso criado.
        </p>
      )}
    </>
  );
}
