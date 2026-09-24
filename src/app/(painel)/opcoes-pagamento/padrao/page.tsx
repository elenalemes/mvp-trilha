import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ehParceiro, getSessao } from "@/lib/sessao";
import { PageHeader } from "@/components/ui";
import FormOpcoesPagamento from "@/components/form-opcoes-pagamento";
import type { OpcaoPagamento } from "@/lib/pagamento";

/** O formulário trabalha com texto e vírgula decimal, que é como se digita. */
const paraTexto = (v: number) => String(v).replace(".", ",");

export default async function MinhasOpcoesPage() {
  const sessao = await getSessao();

  // O admin edita cada incorporadora pela ficha dela, não por aqui.
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

  const { data: incorporadora } = await supabase
    .from("incorporadora")
    .select("percentual_comissao")
    .eq("id", sessao.incorporadoraId)
    .maybeSingle<{ percentual_comissao: number }>();

  const { data: opcoes } = await supabase
    .from("opcao_pagamento")
    .select("ordem, percentual_entrada, percentual_ato, prazo_meses")
    .eq("incorporadora_id", sessao.incorporadoraId)
    .order("ordem")
    .returns<OpcaoPagamento[]>();

  return (
    <>
      <PageHeader
        titulo="Opções de pagamento"
        voltar={{ href: "/opcoes-pagamento", label: "Opções de pagamento" }}
      />

      <p className="mb-6 max-w-3xl text-sm text-muted-foreground">
        Estas condições valem para <strong className="text-foreground">todos os seus imóveis</strong>
        . Aqui só entram percentual e prazo — os valores em reais aparecem na ficha de cada imóvel,
        porque dependem do preço da unidade. Mudou aqui, mudou em todos.
      </p>

      <FormOpcoesPagamento
        incorporadoraId={sessao.incorporadoraId}
        voltarPara="/opcoes-pagamento"
        comissaoInicial={paraTexto(incorporadora?.percentual_comissao ?? 6)}
        iniciais={(opcoes ?? []).map((o) => ({
          percentual_entrada: paraTexto(o.percentual_entrada),
          percentual_ato: paraTexto(o.percentual_ato),
          prazo_meses: String(o.prazo_meses),
        }))}
      />
    </>
  );
}
