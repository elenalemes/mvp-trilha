"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { ehAdmin, getSessao } from "@/lib/sessao";
import { simular } from "@/lib/simulador";
import { calcularCondicao, dividirComissao, type Condicao } from "@/lib/pagamento";
import { PRAZO_TRILHA_MAX, PRAZO_TRILHA_MIN } from "@/lib/trilha";
import { propostaLogadaSchema } from "@/lib/schemas";
import { aceitarProposta } from "@/app/actions/decisoes";

/**
 * A Trilha abre uma negociação pelo painel (Sprint 4.5).
 *
 * É o mesmo caminho do simulador, encurtado: a proposta nasce com os números
 * congelados do dia e é ACEITA na mesma ação, por `aceitarProposta` — a mesma
 * de sempre, que trava a unidade, invalida as propostas concorrentes, gera o
 * checklist e avisa as partes no WhatsApp. Nenhuma regra nova de negócio mora
 * aqui; só o atalho.
 *
 * Venda direta = sem parceiro (`parceiroId` nulo). A comissão fica com a
 * Trilha, e os números não mudam: é a mesma parcela, o mesmo repasse à
 * incorporadora.
 *
 * Os números NÃO vêm do formulário: só a ordem da condição. Valor, parcela,
 * ato e saldo são recalculados aqui, como no simulador.
 */

export type ResultadoNegociacao = { ok: true; negocioId: string } | { ok: false; erro: string };

/** Condição definida à mão (Sprint 4.6). Percentuais sobre o VALOR FINAL. */
export type CondicaoEspecial = {
  valorImovel: number;
  percentualEntrada: number;
  percentualAto: number;
  prazoMeses: number;
  percentualComissao: number;
  /** Vazio = toda a comissão fica com a Trilha. Pontos do valor final. */
  corretores: { parceiroId: string; pontos: number; principal: boolean }[];
  motivo?: string;
};

type Entrada = {
  empreendimentoId: string;
  imovelId: string;
  /** Condição do cadastro, pela ordem. Ignorado quando há `especial`. */
  ordem: number;
  /** Só na condição do cadastro. Nulo = venda direta da Trilha. */
  parceiroId: string | null;
  especial?: CondicaoEspecial;
  comprador: { nome: string; cpf: string; email: string; telefone: string };
  observacao?: string;
};

/** As travas da condição especial — as mesmas das opções cadastradas. */
function validarEspecial(e: CondicaoEspecial): string | null {
  const num = (v: number) => Number.isFinite(v);
  if (!num(e.valorImovel) || e.valorImovel <= 0) return "Informe o valor do imóvel.";
  if (!Number.isInteger(e.prazoMeses) || e.prazoMeses < PRAZO_TRILHA_MIN || e.prazoMeses > PRAZO_TRILHA_MAX) {
    return `O prazo precisa ficar entre ${PRAZO_TRILHA_MIN} e ${PRAZO_TRILHA_MAX} meses.`;
  }
  if (!num(e.percentualEntrada) || e.percentualEntrada <= 0 || e.percentualEntrada > 100) return "Entrada inválida.";
  if (!num(e.percentualAto) || e.percentualAto < 0) return "Ato inválido.";
  if (e.percentualAto > e.percentualEntrada) return "O ato não pode ser maior que a entrada.";
  if (!num(e.percentualComissao) || e.percentualComissao < 0 || e.percentualComissao > 100) return "Comissão inválida.";
  const ids = e.corretores.map((c) => c.parceiroId);
  if (new Set(ids).size !== ids.length) return "O mesmo corretor aparece duas vezes na divisão.";
  if (e.corretores.some((c) => !num(c.pontos) || c.pontos <= 0)) return "Informe a parte de cada corretor.";
  const soma = e.corretores.reduce((t, c) => t + c.pontos, 0);
  if (soma > e.percentualComissao + 1e-9) return "A soma das partes dos corretores passa da comissão total.";
  if (e.corretores.length && e.corretores.filter((c) => c.principal).length !== 1) {
    return "Marque um corretor como principal.";
  }
  return null;
}

const digitos = (v: string) => v.replace(/\D/g, "");

export async function iniciarNegociacao(entrada: Entrada): Promise<ResultadoNegociacao> {
  const sessao = await getSessao();
  if (!ehAdmin(sessao)) return { ok: false, erro: "Só a Trilha abre negociação pelo painel." };

  const lido = propostaLogadaSchema.safeParse({ comprador: entrada.comprador, observacao: entrada.observacao });
  if (!lido.success) return { ok: false, erro: lido.error.issues[0]?.message ?? "Confira os dados do comprador." };

  const simulacao = await simular(entrada.empreendimentoId, entrada.imovelId, true);
  if (!simulacao) return { ok: false, erro: "Esta unidade não está mais disponível." };

  const especial = entrada.especial;
  let condicao: Condicao | null | undefined;
  let parceiroPrincipal: string | null;

  if (especial) {
    const invalido = validarEspecial(especial);
    if (invalido) return { ok: false, erro: invalido };
    // A MESMA conta das opções cadastradas; só as entradas vêm da Trilha.
    condicao = calcularCondicao(
      especial.valorImovel,
      {
        ordem: 0,
        percentual_entrada: especial.percentualEntrada,
        percentual_ato: especial.percentualAto,
        prazo_meses: especial.prazoMeses,
      },
      especial.percentualComissao,
    );
    if (!condicao) return { ok: false, erro: "Não consegui calcular esta condição." };
    if (!condicao.comissaoCabe) {
      return { ok: false, erro: "A comissão é maior que o que se paga parcelado. Aumente a entrada ou reduza o ato ou a comissão." };
    }
    parceiroPrincipal = especial.corretores.find((c) => c.principal)?.parceiroId ?? null;
  } else {
    condicao = simulacao.condicoes.find((c) => c.ordem === entrada.ordem);
    if (!condicao) return { ok: false, erro: "Esta condição de pagamento não vale mais para esta unidade." };
    parceiroPrincipal = entrada.parceiroId;
  }

  const admin = createAdminClient();

  // Todo corretor precisa ser parceiro da incorporadora dona da unidade — ou
  // Parceiro Trilha (sem incorporadora), que pode entrar em qualquer negócio.
  const idsCorretores = especial ? especial.corretores.map((c) => c.parceiroId) : parceiroPrincipal ? [parceiroPrincipal] : [];
  const nomes = new Map<string, string>();
  if (idsCorretores.length) {
    const { data: parceiros } = await admin
      .from("parceiro")
      .select("id, nome")
      .in("id", idsCorretores)
      .or(`incorporadora_id.eq.${simulacao.incorporadoraId},incorporadora_id.is.null`)
      .returns<{ id: string; nome: string }[]>();
    for (const p of parceiros ?? []) nomes.set(p.id, p.nome);
    if (nomes.size !== idsCorretores.length) {
      return { ok: false, erro: "Um dos corretores não é parceiro desta incorporadora nem Parceiro Trilha." };
    }
  }

  // O comprador é uma pessoa só, pelo CPF — como no simulador.
  const c = lido.data.comprador;
  const { data: comprador, error: erroComprador } = await admin
    .from("comprador")
    .upsert(
      { nome: c.nome.trim(), cpf: digitos(c.cpf), email: c.email.trim().toLowerCase(), telefone: digitos(c.telefone) },
      { onConflict: "cpf" },
    )
    .select("id")
    .maybeSingle<{ id: string }>();
  if (erroComprador || !comprador) {
    console.error("[negociação] comprador não gravou:", erroComprador);
    return { ok: false, erro: "Não consegui registrar os dados do comprador. Tente de novo." };
  }

  // Na condição especial não há opção cadastrada por trás.
  const consultaOpcao = admin
    .from("opcao_pagamento")
    .select("id")
    .eq("incorporadora_id", simulacao.incorporadoraId)
    .eq("ordem", entrada.ordem);
  const { data: opcao } = especial
    ? { data: null }
    : simulacao.escopo === "empreendimento"
      ? await consultaOpcao.eq("empreendimento_id", simulacao.empreendimentoId).maybeSingle<{ id: string }>()
      : await consultaOpcao.is("empreendimento_id", null).maybeSingle<{ id: string }>();

  const { data: proposta, error } = await admin
    .from("proposta")
    .insert({
      imovel_id: entrada.imovelId,
      empreendimento_id: simulacao.empreendimentoId,
      incorporadora_id: simulacao.incorporadoraId,
      parceiro_id: parceiroPrincipal,
      comprador_id: comprador.id,
      origem: "trilha",
      criada_por: sessao!.usuarioId,

      valor_imovel: especial ? especial.valorImovel : simulacao.valorImovel,
      valor_tabela: simulacao.valorImovel,
      condicao_especial: !!especial,
      motivo_condicao: especial?.motivo?.trim() || null,
      escopo: simulacao.escopo,
      opcao_pagamento_id: opcao?.id ?? null,

      prazo_meses: condicao.prazoMeses,
      percentual_ato: condicao.percentualAto,
      percentual_entrada: condicao.percentualEntrada,
      percentual_comissao: condicao.percentualComissao,

      valor_base: condicao.base,
      valor_ato: condicao.ato,
      valor_parcela: condicao.parcela,
      valor_entrada: condicao.entrada,
      valor_saldo: condicao.saldoFinanciar,

      condicao,
      observacao: lido.data.observacao || null,
    })
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error || !proposta) {
    console.error("[negociação] proposta não gravou:", error);
    return { ok: false, erro: motivoDaFalha(error) };
  }

  // A divisão da comissão, congelada junto com a proposta.
  if (especial && especial.corretores.length) {
    const divisao = dividirComissao(
      condicao,
      especial.corretores.map((c) => ({ parceiroId: c.parceiroId, nome: nomes.get(c.parceiroId) ?? "", pontos: c.pontos })),
    );
    const { error: erroDivisao } = await admin.from("proposta_corretor").insert(
      divisao.corretores.map((c) => ({
        proposta_id: proposta.id,
        parceiro_id: c.parceiroId,
        principal: c.parceiroId === parceiroPrincipal,
        percentual: c.pontos,
        valor_total: c.total,
        valor_mensal: c.mensal,
      })),
    );
    if (erroDivisao) {
      console.error("[negociação] divisão não gravou:", erroDivisao);
      await admin.from("proposta").delete().eq("id", proposta.id);
      return { ok: false, erro: "Não consegui registrar a divisão da comissão. Tente de novo." };
    }
  }

  // Aceitar com a sessão do admin: `aceitar_proposta` confere que é a Trilha.
  const aceite = await aceitarProposta(proposta.id);
  if (!aceite.ok) {
    // A proposta só existia para virar negócio. Se não virou (a unidade saiu
    // do estoque nesse meio-tempo), ela não deve ficar na fila de análise.
    await admin.from("proposta").delete().eq("id", proposta.id);
    return { ok: false, erro: aceite.erro };
  }

  const supabase = await createClient();
  const { data: negocio } = await supabase
    .from("negocio")
    .select("id")
    .eq("proposta_id", proposta.id)
    .maybeSingle<{ id: string }>();

  revalidatePath("/negocios");
  return negocio ? { ok: true, negocioId: negocio.id } : { ok: false, erro: "O negócio foi aberto, mas não consegui abri-lo aqui. Veja em Setups de negócios." };
}

/**
 * Quem abre negociação aqui é sempre a Trilha, então vale dizer a causa real:
 * coluna faltando ou parceiro obrigatório quase sempre é SQL da sprint não rodado.
 */
function motivoDaFalha(error: { code?: string; message?: string } | null): string {
  if (!error) return "Não consegui abrir a negociação. Tente de novo em instantes.";
  if (error.code === "PGRST204" || error.code === "42703") {
    return `O banco ainda não tem as colunas novas (${error.message}). Rode no Supabase: negociacao-pela-trilha.sql e depois condicao-especial.sql.`;
  }
  if (error.code === "23502") {
    return "O banco ainda exige corretor em toda proposta. Rode no Supabase o negociacao-pela-trilha.sql.";
  }
  if (error.code === "42501") {
    return "O banco recusou a gravação por permissão (RLS). Confira se o seu usuário é admin da Trilha.";
  }
  return `Não consegui abrir a negociação (${error.code ?? "erro"}: ${error.message ?? "sem detalhe"}).`;
}
