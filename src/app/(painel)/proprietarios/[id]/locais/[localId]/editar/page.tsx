import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ehAdmin, getSessao } from "@/lib/sessao";
import { PageHeader } from "@/components/ui";
import FormLocalAvulso from "@/components/form-local-avulso";

export default async function EditarLocalPage({ params }: { params: Promise<{ id: string; localId: string }> }) {
  const sessao = await getSessao();
  if (!ehAdmin(sessao)) redirect("/");

  const { id, localId } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("empreendimento")
    .select("nome, endereco")
    .eq("id", localId)
    .eq("incorporadora_id", id)
    .maybeSingle<{ nome: string; endereco: string | null }>();
  if (!data) notFound();

  return (
    <>
      <PageHeader titulo="Editar local" descricao={data.nome} voltar={{ href: `/proprietarios/${id}`, label: "Voltar" }} />
      <FormLocalAvulso
        proprietarioId={id}
        localId={localId}
        inicial={{ nome: data.nome, endereco: data.endereco ?? "" }}
        destino={`/proprietarios/${id}`}
      />
    </>
  );
}
