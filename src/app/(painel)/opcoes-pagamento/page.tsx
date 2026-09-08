import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ehParceiro, getSessao } from "@/lib/sessao";
import { PageHeader } from "@/components/ui";
import ListaOpcoes from "@/components/lista-opcoes";
import { CAMPOS_OPCAO, opcoesPadrao } from "@/lib/opcoes";
import type { OpcaoPagamento } from "@/lib/pagamento";

type Linha = OpcaoPagamento & {
  empreendimento_id: string | null;
  empreendimento: { nome: string } | null;
};

function Editar({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="font-display rounded-md border border-trilha-200 bg-white px-3.5 py-1.5 text-sm font-semibold tracking-wide text-trilha-700 transition-colors hover:border-trilha-500 hover:bg-trilha-50"
    >
      {label}
    </Link>
  );
}

/**
 * A tela da incorporadora: o padrão dela e os empreendimentos que fogem dele.
 *
 * Não existe equivalente para o admin da Trilha — "opções de pagamento" sem
 * dizer de qual incorporadora não significa nada. Do lado dele, elas vivem na
 * ficha de cada incorporadora.
 */
export default async function OpcoesPagamentoPage() {
  const sessao = await getSessao();
  if (sessao?.conta?.tipo === "trilha_admin") redirect("/incorporadoras");
  // O parceiro não tem opções nem ficha própria: o cadastro dele é de quem o cadastrou.
  if (ehParceiro(sessao)) redirect("/empreendimentos");

  if (!sessao?.incorporadoraId) {
    return (
      <p className="rounded-md border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
        Esta conta não está ligada a nenhuma incorporadora.
      </p>
    );
  }

  const supabase = await createClient();
  const incorporadoraId = sessao.incorporadoraId;

  const [padrao, { data: proprias }, { data: minhaFicha }] = await Promise.all([
    opcoesPadrao(supabase, incorporadoraId),
    supabase
      .from("opcao_pagamento")
      .select(`${CAMPOS_OPCAO}, empreendimento_id, empreendimento (nome)`)
      .eq("incorporadora_id", incorporadoraId)
      .not("empreendimento_id", "is", null)
      .order("ordem")
      .returns<Linha[]>(),
    // A comissão é da incorporadora, não de cada opção — por isso vem daqui e
    // aparece uma vez só, embaixo do padrão.
    supabase
      .from("incorporadora")
      .select("percentual_comissao")
      .eq("id", incorporadoraId)
      .maybeSingle<{ percentual_comissao: number }>(),
  ]);

  // Um bloco por empreendimento que decidiu não usar o padrão.
  const porEmpreendimento = new Map<string, { nome: string; opcoes: Linha[] }>();
  for (const l of proprias ?? []) {
    if (!l.empreendimento_id) continue;
    const atual = porEmpreendimento.get(l.empreendimento_id);
    if (atual) atual.opcoes.push(l);
    else
      porEmpreendimento.set(l.empreendimento_id, {
        nome: l.empreendimento?.nome ?? "Empreendimento",
        opcoes: [l],
      });
  }

  return (
    <>
      <PageHeader
        titulo="Opções de pagamento"
        descricao="Defina opções de pagamento para os imóveis à venda com a Trilha."
      />

      <section className="rounded-lg border border-trilha-200 bg-white p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold text-trilha-700">Padrão</h2>
            <p className="mt-0.5 text-sm text-trilha-400">
              Vale para todos os seus imóveis, menos os de empreendimentos com condições próprias.
            </p>
          </div>
          <Editar
            href="/opcoes-pagamento/padrao"
            label={padrao.length ? "Editar padrão" : "Definir padrão"}
          />
        </div>
        <ListaOpcoes opcoes={padrao} percentualComissao={minhaFicha?.percentual_comissao} />

        {[...porEmpreendimento].map(([empId, emp]) => (
          <div key={empId} className="mt-6 border-t border-trilha-100 pt-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-display text-sm font-semibold tracking-[0.12em] text-trilha-400 uppercase">
                {emp.nome} — condições próprias
              </h3>
              <Editar href={`/empreendimentos/${empId}/opcoes-pagamento`} label="Editar condições" />
            </div>
            <ListaOpcoes opcoes={emp.opcoes} />
          </div>
        ))}
      </section>
    </>
  );
}
