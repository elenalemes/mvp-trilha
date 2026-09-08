import { notFound, redirect } from "next/navigation";
import { getSessao, podeEditar } from "@/lib/sessao";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import FormImovel, { IMOVEL_VAZIO } from "@/components/form-imovel";

export default async function NovoImovelPage({ params }: { params: Promise<{ id: string }> }) {
  const sessao = await getSessao();
  if (!podeEditar(sessao)) redirect("/empreendimentos");

  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("empreendimento")
    .select("id, nome")
    .eq("id", id)
    .maybeSingle<{ id: string; nome: string }>();

  if (!data) notFound();

  return (
    <>
      <PageHeader
        titulo="Cadastrar imóvel"
        descricao={data.nome}
        voltar={{ href: `/empreendimentos/${id}`, label: data.nome }}
      />
      <FormImovel
        modo="criar"
        empreendimentoId={id}
        inicial={{ empreendimento_id: id, ...IMOVEL_VAZIO }}
      />
    </>
  );
}
