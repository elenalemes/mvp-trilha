import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ehAdmin, getSessao } from "@/lib/sessao";
import { PageHeader } from "@/components/ui";
import ErroLeitura from "@/components/erro-leitura";
import ListaParceiros, { type ParceiroLinha } from "@/components/lista-parceiros";

const CAMPOS =
  "id, nome, documento, creci, email, telefone, ativo, conta_id, convite_token, conta (email)";

/**
 * Parceiro Trilha: corretor independente, sem incorporadora.
 *
 * No banco é um `parceiro` com `incorporadora_id` nulo. Pode enviar proposta
 * para qualquer unidade e entrar na divisão de comissão de qualquer negócio.
 * Só a Trilha cadastra e gerencia.
 */
export default async function ParceiroTrilhaPage() {
  const sessao = await getSessao();
  if (!ehAdmin(sessao)) redirect("/");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("parceiro")
    .select(CAMPOS)
    .is("incorporadora_id", null)
    .order("nome")
    .returns<ParceiroLinha[]>();

  if (error) return <ErroLeitura oQue="dos Parceiros Trilha" erro={error} />;

  return (
    <>
      <PageHeader
        titulo="Parceiro Trilha"
        descricao="Corretores independentes. Enviam proposta para qualquer unidade e podem entrar em qualquer negócio."
        acao={{ href: "/parceiro-trilha/novo", label: "Cadastrar Parceiro Trilha" }}
      />
      <ListaParceiros parceiros={data ?? []} base="/parceiro-trilha" />
    </>
  );
}
