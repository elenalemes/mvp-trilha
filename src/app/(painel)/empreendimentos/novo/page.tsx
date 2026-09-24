import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getSessao, podeEditar } from "@/lib/sessao";
import { EmptyState, PageHeader } from "@/components/ui";
import FormEmpreendimento from "@/components/form-empreendimento";

export default async function NovoEmpreendimentoPage({
  searchParams,
}: {
  searchParams: Promise<{ incorporadora?: string }>;
}) {
  const { incorporadora } = await searchParams;
  const sessao = await getSessao();
  // O parceiro é somente-leitura: não chega nem a ver o formulário.
  if (!podeEditar(sessao)) redirect("/empreendimentos");
  const admin = sessao?.conta?.tipo === "trilha_admin";

  const supabase = await createClient();
  const { data } = await supabase
    .from("incorporadora")
    .select("id, nome")
    // Proprietário PF tem menu próprio.
    .eq("tipo", "incorporadora")
    .order("nome")
    .returns<{ id: string; nome: string }[]>();

  const lista = data ?? [];

  return (
    <>
      <PageHeader
        titulo="Novo empreendimento"
        voltar={{ href: "/empreendimentos", label: "Empreendimentos" }}
      />

      {lista.length === 0 ? (
        <EmptyState
          titulo="Cadastre uma incorporadora primeiro"
          texto="Cadastre uma incorporadora primeiro."
          acao={admin ? { href: "/incorporadoras/nova", label: "Cadastrar incorporadora" } : undefined}
        />
      ) : (
        <FormEmpreendimento
          modo="criar"
          incorporadoras={lista}
          admin={admin}
          inicial={{
            incorporadora_id: incorporadora ?? lista[0].id,
            nome: "",
            endereco: "",
          }}
        />
      )}
    </>
  );
}
