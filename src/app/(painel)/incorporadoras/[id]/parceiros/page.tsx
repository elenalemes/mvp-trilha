import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessao } from "@/lib/sessao";
import { PageHeader } from "@/components/ui";
import ErroLeitura from "@/components/erro-leitura";
import ListaParceiros, { type ParceiroLinha } from "@/components/lista-parceiros";

export default async function ParceirosDaIncorporadoraPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const sessao = await getSessao();
  if (sessao?.conta && sessao.conta.tipo !== "trilha_admin") redirect("/empreendimentos");

  const { id } = await params;
  const supabase = await createClient();

  const { data: incorporadora } = await supabase
    .from("incorporadora")
    .select("nome")
    .eq("id", id)
    .maybeSingle<{ nome: string }>();

  if (!incorporadora) notFound();

  const { data, error } = await supabase
    .from("parceiro")
    .select("id, nome, documento, creci, email, telefone, ativo, conta_id, conta (email)")
    .eq("incorporadora_id", id)
    .order("nome")
    .returns<ParceiroLinha[]>();

  if (error) return <ErroLeitura oQue="dos parceiros" erro={error} />;

  const base = `/incorporadoras/${id}/parceiros`;

  return (
    <>
      <PageHeader
        titulo="Parceiros imobiliários"
        descricao={incorporadora.nome}
        voltar={{ href: `/incorporadoras/${id}`, label: "Voltar para a ficha" }}
        acao={{ href: `${base}/novo`, label: "Cadastrar parceiro" }}
      />

      <p className="mb-6 max-w-3xl text-[15px] text-muted-foreground">
        Cada parceiro entra na plataforma com o próprio login e enxerga{" "}
        <strong className="text-foreground">somente as unidades disponíveis</strong> desta
        incorporadora, com as condições de pagamento de cada uma. Ele não cadastra nem altera nada.
      </p>

      <ListaParceiros parceiros={data ?? []} base={base} />
    </>
  );
}
