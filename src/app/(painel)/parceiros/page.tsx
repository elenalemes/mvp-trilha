import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ehAdmin, ehParceiro, getSessao } from "@/lib/sessao";
import { PageHeader } from "@/components/ui";
import ErroLeitura from "@/components/erro-leitura";
import ListaParceiros, { type ParceiroLinha } from "@/components/lista-parceiros";

const CAMPOS = "id, nome, documento, creci, email, telefone, ativo, conta_id, conta (email)";

/**
 * Os parceiros imobiliários.
 *
 * A mesma rota atende os dois lados, porque a pergunta é a mesma — "quem vende
 * as minhas unidades?" — e só muda o tamanho do "minhas":
 *
 *   incorporadora — os parceiros dela. É o recorte que o banco já faz sozinho.
 *   Trilha        — todos, com a incorporadora de cada um numa coluna.
 *
 * Do lado da Trilha a ficha de cada parceiro continua morando sob a
 * incorporadora dele. Esta tela é a porta de entrada por cima; as telas de
 * edição e de acesso são as que já existem.
 *
 * O parceiro não tem esta tela: ele não cadastra ninguém.
 */
export default async function ParceirosPage() {
  const sessao = await getSessao();
  if (ehParceiro(sessao)) redirect("/empreendimentos");

  const supabase = await createClient();
  const admin = ehAdmin(sessao);

  if (!admin && !sessao?.incorporadoraId) {
    return (
      <p className="rounded-md border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
        Esta conta não está ligada a nenhuma incorporadora.
      </p>
    );
  }

  const consulta = admin
    ? supabase.from("parceiro").select(`${CAMPOS}, incorporadora (id, nome)`).order("nome")
    : supabase
        .from("parceiro")
        .select(CAMPOS)
        .eq("incorporadora_id", sessao!.incorporadoraId!)
        .order("nome");

  const { data, error } = await consulta.returns<ParceiroLinha[]>();

  if (error) return <ErroLeitura oQue={admin ? "dos parceiros" : "dos seus parceiros"} erro={error} />;

  const parceiros = data ?? [];

  return (
    <>
      <PageHeader
        titulo="Parceiros imobiliários"
        descricao={
          admin
            ? "Imobiliárias e corretores de todas as incorporadoras."
            : "Imobiliárias e corretores que vendem as suas unidades."
        }
        acao={{ href: "/parceiros/novo", label: "Cadastrar parceiro" }}
      />

      <p className="mb-6 max-w-3xl text-[15px] text-trilha-400">
        Cada parceiro entra com o próprio login e enxerga{" "}
        <strong className="text-trilha-700">somente as unidades disponíveis</strong> da incorporadora
        dele, com as condições de pagamento de cada uma. Ele não cadastra nem altera nada — nem
        imóvel, nem empreendimento, nem condição de pagamento.
      </p>

      <ListaParceiros
        parceiros={parceiros}
        base="/parceiros"
        mostrarIncorporadora={admin}
        fichaDe={
          admin
            ? (p) =>
                p.incorporadora ? `/incorporadoras/${p.incorporadora.id}/parceiros` : "/parceiros"
            : undefined
        }
      />
    </>
  );
}
