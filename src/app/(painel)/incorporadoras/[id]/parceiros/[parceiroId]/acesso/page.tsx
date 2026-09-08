import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessao } from "@/lib/sessao";
import { PageHeader } from "@/components/ui";
import ErroLeitura from "@/components/erro-leitura";
import FormAcessoParceiro from "@/components/form-acesso-parceiro";

type Registro = {
  nome: string;
  conta_id: string | null;
  conta: { email: string | null } | null;
};

export default async function AcessoParceiroPage({
  params,
}: {
  params: Promise<{ id: string; parceiroId: string }>;
}) {
  const sessao = await getSessao();
  if (sessao?.conta && sessao.conta.tipo !== "trilha_admin") redirect("/empreendimentos");

  const { id, parceiroId } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("parceiro")
    .select("nome, conta_id, conta (email)")
    .eq("id", parceiroId)
    .eq("incorporadora_id", id)
    .maybeSingle<Registro>();

  if (error) return <ErroLeitura oQue="deste parceiro" erro={error} />;
  if (!data) notFound();

  const voltarPara = `/incorporadoras/${id}/parceiros`;

  return (
    <>
      <PageHeader
        titulo="Dados de acesso"
        descricao={data.nome}
        voltar={{ href: voltarPara, label: "Parceiros" }}
      />

      {data.conta_id ? (
        <FormAcessoParceiro
          id={parceiroId}
          emailAtual={data.conta?.email ?? ""}
          voltarPara={voltarPara}
        />
      ) : (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          Este parceiro ainda não tem acesso criado.
        </p>
      )}
    </>
  );
}
