import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ehParceiro, getSessao } from "@/lib/sessao";
import { PageHeader } from "@/components/ui";
import ErroLeitura from "@/components/erro-leitura";
import ListaParceiros, { type ParceiroLinha } from "@/components/lista-parceiros";

/**
 * Os parceiros da própria incorporadora.
 *
 * O admin da Trilha não tem esta tela: "parceiros" sem dizer de qual
 * incorporadora não significa nada do lado dele — lá eles vivem na ficha de
 * cada uma. É a mesma razão pela qual "Opções de pagamento" só existe no menu
 * da incorporadora.
 */
export default async function MeusParceirosPage() {
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

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("parceiro")
    .select("id, nome, documento, creci, email, telefone, ativo, conta_id, conta (email)")
    .eq("incorporadora_id", sessao.incorporadoraId)
    .order("nome")
    .returns<ParceiroLinha[]>();

  if (error) return <ErroLeitura oQue="dos seus parceiros" erro={error} />;

  return (
    <>
      <PageHeader
        titulo="Parceiros imobiliários"
        descricao="Imobiliárias e corretores que vendem as suas unidades."
        acao={{ href: "/parceiros/novo", label: "Cadastrar parceiro" }}
      />

      <p className="mb-6 max-w-3xl text-[15px] text-trilha-400">
        Cada parceiro entra com o próprio login e enxerga{" "}
        <strong className="text-trilha-700">somente as suas unidades disponíveis</strong>, com as
        condições de pagamento de cada uma. Ele não cadastra nem altera nada — nem imóvel, nem
        empreendimento, nem condição de pagamento.
      </p>

      <ListaParceiros parceiros={data ?? []} base="/parceiros" />
    </>
  );
}
