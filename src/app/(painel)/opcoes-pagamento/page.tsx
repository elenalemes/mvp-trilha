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
      className="rounded-md border border-border bg-card px-3.5 py-1.5 text-sm font-semibold text-foreground transition-colors hover:border-foreground/30 hover:bg-accent"
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
      <p className="rounded-md border border-aviso/20 bg-aviso-suave px-5 py-4 text-sm text-aviso">
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
      />

      <section className="rounded-xl border bg-card p-6 shadow-xs">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Padrão</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Vale para todos os empreendimentos sem condições próprias.
            </p>
          </div>
          <Editar
            href="/opcoes-pagamento/padrao"
            label={padrao.length ? "Editar padrão" : "Definir padrão"}
          />
        </div>
        <ListaOpcoes opcoes={padrao} percentualComissao={minhaFicha?.percentual_comissao} />

        {[...porEmpreendimento].map(([empId, emp]) => (
          <div key={empId} className="mt-6 border-t border-border pt-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-muted-foreground">
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
