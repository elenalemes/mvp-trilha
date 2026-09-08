import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessao } from "@/lib/sessao";
import { PageHeader } from "@/components/ui";
import FormOpcoesPagamento from "@/components/form-opcoes-pagamento";

type Registro = { nome: string; percentual_comissao: number };

type Opcao = {
  ordem: number;
  percentual_entrada: number;
  percentual_ato: number;
  prazo_meses: number;
};

/** O formulário trabalha com texto e vírgula decimal, que é como se digita. */
const paraTexto = (v: number) => String(v).replace(".", ",");


/**
 * "Não existe" e "não consigo ler" são coisas diferentes, e confundir as duas
 * já custou rodadas de conserto no lugar errado nesta base. Erro do banco vira
 * mensagem na tela com código e motivo; ausência de linha vira 404.
 */
function ErroDeLeitura({ erro }: { erro: { code?: string; message?: string } }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-4">
      <p className="font-display text-[15px] font-semibold text-red-800">
        O banco recusou a leitura desta incorporadora.
      </p>
      <p className="mt-1 text-sm text-red-700">
        {erro.code ?? "sem código"}: {erro.message ?? "sem mensagem"}
      </p>
      <p className="mt-2 text-sm text-red-700">
        Isso não quer dizer que o cadastro não exista — quer dizer que esta sessão não conseguiu
        lê-lo.
      </p>
    </div>
  );
}

export default async function OpcoesPagamentoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const sessao = await getSessao();
  if (sessao?.conta && sessao.conta.tipo !== "trilha_admin") redirect("/empreendimentos");

  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("incorporadora")
    .select("nome, percentual_comissao")
    .eq("id", id)
    .maybeSingle<Registro>();

  if (error) return <ErroDeLeitura erro={error} />;
  if (!data) notFound();

  const { data: opcoes } = await supabase
    .from("opcao_pagamento")
    .select("ordem, percentual_entrada, percentual_ato, prazo_meses")
    .eq("incorporadora_id", id)
    .order("ordem")
    .returns<Opcao[]>();

  return (
    <>
      <PageHeader
        titulo="Opções de pagamento"
        descricao={data.nome}
        voltar={{ href: `/incorporadoras/${id}`, label: "Voltar para a ficha" }}
      />

      <p className="mb-6 max-w-3xl text-[15px] text-trilha-400">
        Estas condições valem para <strong className="text-trilha-700">todos os imóveis</strong>{" "}
        desta incorporadora. Aqui só entram percentual e prazo — os valores em reais aparecem na
        ficha de cada imóvel, porque dependem do preço da unidade.
      </p>

      <FormOpcoesPagamento
        incorporadoraId={id}
        voltarPara={`/incorporadoras/${id}`}
        comissaoInicial={paraTexto(data.percentual_comissao)}
        iniciais={(opcoes ?? []).map((o) => ({
          percentual_entrada: paraTexto(o.percentual_entrada),
          percentual_ato: paraTexto(o.percentual_ato),
          prazo_meses: String(o.prazo_meses),
        }))}
      />
    </>
  );
}
