import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ehAdmin, getSessao } from "@/lib/sessao";
import { formatBRL } from "@/lib/br";
import { EmptyState, PageHeader } from "@/components/ui";
import ErroLeitura from "@/components/erro-leitura";
import { SituacaoProposta } from "@/components/situacao-proposta";

/**
 * A fila de propostas da Trilha.
 *
 * A tela é uma fila de trabalho, não um relatório: o que está esperando
 * decisão vem primeiro, em cima, separado do que já foi decidido. Uma lista
 * única ordenada por data enterra a proposta de ontem que ninguém olhou
 * embaixo das dez de hoje que já foram resolvidas.
 *
 * Quem decide é a Trilha — formato de pagamento e qualificação do comprador.
 * Por isso esta tela é só dela. A incorporadora tem a sua, com outro recorte.
 */
export const dynamic = "force-dynamic";

type Linha = {
  id: string;
  codigo: string;
  status: string;
  created_at: string;
  prazo_meses: number;
  valor_parcela: number;
  valor_base: number;
  imovel: { identificacao: string } | null;
  empreendimento: { nome: string } | null;
  incorporadora: { nome: string } | null;
  parceiro: { nome: string; ativo: boolean; origem: string } | null;
};

const ABERTAS = ["enviada", "em_analise"];

export default async function PropostasPage() {
  const sessao = await getSessao();
  if (!ehAdmin(sessao)) redirect("/empreendimentos");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("proposta")
    .select(
      `id, codigo, status, created_at, prazo_meses, valor_parcela, valor_base,
       imovel (identificacao),
       empreendimento (nome),
       incorporadora (nome),
       parceiro (nome, ativo, origem)`,
    )
    .order("created_at", { ascending: false })
    .returns<Linha[]>();

  if (error) return <ErroLeitura oQue="das propostas" erro={error} />;

  const propostas = data ?? [];
  const abertas = propostas.filter((p) => ABERTAS.includes(p.status));
  const decididas = propostas.filter((p) => !ABERTAS.includes(p.status));

  return (
    <>
      <PageHeader
        titulo="Propostas"
        descricao="Pedidos de negócio enviados pelos corretores."
      />

      {propostas.length === 0 ? (
        <EmptyState
          titulo="Nenhuma proposta ainda"
          texto="As propostas chegam pelo simulador, quando um corretor escolhe uma condição e envia os dados do comprador."
        />
      ) : (
        <div className="flex flex-col gap-10">
          <Bloco
            titulo="Esperando decisão"
            vazio="Nenhuma proposta aguardando. Fila limpa."
            propostas={abertas}
          />
          {decididas.length > 0 ? (
            <Bloco titulo="Já decididas" vazio="" propostas={decididas} />
          ) : null}
        </div>
      )}
    </>
  );
}

function Bloco({
  titulo,
  vazio,
  propostas,
}: {
  titulo: string;
  vazio: string;
  propostas: Linha[];
}) {
  return (
    <section>
      <h2 className="font-display mb-3 text-sm font-semibold tracking-[0.12em] text-trilha-400 uppercase">
        {titulo}
        <span className="ml-2 normal-case tracking-normal text-trilha-300">
          {propostas.length}
        </span>
      </h2>

      {propostas.length === 0 ? (
        <p className="rounded-lg border border-trilha-200 bg-white px-5 py-6 text-[15px] text-trilha-400">
          {vazio}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-trilha-200 bg-white">
          <table className="w-full min-w-[940px] border-collapse text-left">
            <thead>
              <tr className="border-b border-trilha-100">
                {["Código", "Unidade", "Incorporadora", "Corretor", "Condição", "Situação"].map(
                  (h) => (
                    <th
                      key={h}
                      className="font-display px-5 py-3 text-sm font-semibold tracking-wide text-trilha-400 uppercase"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {propostas.map((p) => (
                <tr key={p.id} className="border-b border-trilha-100 last:border-0">
                  <td className="px-5 py-4">
                    <Link
                      href={`/propostas/${p.id}`}
                      className="font-display text-[17px] font-semibold tabular-nums text-trilha-700 underline underline-offset-2 hover:text-trilha-500"
                    >
                      {p.codigo}
                    </Link>
                    <span className="block text-sm text-trilha-400">
                      {new Date(p.created_at).toLocaleDateString("pt-BR")}
                    </span>
                  </td>

                  <td className="px-5 py-4 text-[15px]">
                    {p.imovel?.identificacao ?? "—"}
                    <span className="block text-sm text-trilha-400">
                      {p.empreendimento?.nome ?? "—"}
                    </span>
                  </td>

                  <td className="px-5 py-4 text-[15px] text-trilha-400">
                    {p.incorporadora?.nome ?? "—"}
                  </td>

                  <td className="px-5 py-4 text-[15px]">
                    {p.parceiro?.nome ?? "—"}
                    {/* O corretor que nasceu desta proposta ainda não tem
                        acesso. Dizer isso aqui é o que faz a fila de aprovação
                        ser vista por quem pode resolvê-la. */}
                    {p.parceiro && p.parceiro.origem === "proposta" && !p.parceiro.ativo ? (
                      <span className="block text-sm font-semibold text-amber-700">
                        cadastro pendente
                      </span>
                    ) : null}
                  </td>

                  <td className="px-5 py-4 text-[15px] tabular-nums">
                    {p.prazo_meses}× {formatBRL(p.valor_parcela)}
                    <span className="block text-sm text-trilha-400">
                      imóvel {formatBRL(p.valor_base)}
                    </span>
                  </td>

                  <td className="px-5 py-4">
                    <SituacaoProposta status={p.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
