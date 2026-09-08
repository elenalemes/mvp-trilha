"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { opcoesPagamentoSchema } from "@/lib/schemas";
import { parseDecimal } from "@/lib/br";
import { getSessao } from "@/lib/sessao";

export type Resultado = { erro: null } | { erro: string };

const detalhar = (mensagem: string, erro: { code?: string; message?: string } | null) =>
  erro?.message ? `${mensagem} (${erro.code ?? "sem código"}: ${erro.message})` : mensagem;

/**
 * Substitui a lista inteira de opções da incorporadora.
 *
 * A tela edita as quatro juntas, então salvar é "essas passam a ser as
 * opções". Quem faz a troca é a função `salvar_opcoes_pagamento` no banco,
 * numa transação só — apagar aqui e inserir numa segunda chamada deixaria a
 * incorporadora sem nenhuma opção se a segunda falhasse.
 */
export async function salvarOpcoesPagamento(
  incorporadoraId: string,
  bruto: unknown,
  /** Sem isto, salva o padrão da incorporadora. Com isto, as condições
   *  próprias daquele empreendimento. */
  empreendimentoId?: string,
): Promise<Resultado> {
  const sessao = await getSessao();
  if (!sessao?.conta) {
    return { erro: "Sessão expirada. Entre de novo." };
  }

  const parsed = opcoesPagamentoSchema.safeParse(bruto);
  if (!parsed.success) {
    return { erro: "Confira os campos destacados e tente de novo." };
  }

  // O formulário trabalha com texto ("2,5"); o banco quer número.
  const opcoes = parsed.data.opcoes.map((o) => ({
    percentual_entrada: parseDecimal(o.percentual_entrada),
    percentual_ato: parseDecimal(o.percentual_ato || "0") ?? 0,
    prazo_meses: parseDecimal(o.prazo_meses),
  }));

  const supabase = await createClient();

  // A comissão é da incorporadora, então só muda quando se edita o padrão —
  // nunca pela tela de condições próprias de um empreendimento. Vai junto das
  // opções, na mesma transação: ou as duas coisas valem, ou nenhuma.
  const comissao =
    !empreendimentoId && parsed.data.percentual_comissao
      ? parseDecimal(parsed.data.percentual_comissao)
      : null;

  const { error } = await supabase.rpc("salvar_opcoes_pagamento", {
    p_incorporadora: incorporadoraId,
    p_opcoes: opcoes,
    p_empreendimento: empreendimentoId ?? null,
    p_comissao: comissao,
  });

  if (error) {
    // As travas do banco existem para nunca deixar passar uma condição que não
    // fecha — mesmo que o formulário tenha deixado escapar.
    if (error.code === "23514") {
      if (error.message.includes("ato_cabe_na_entrada")) {
        return { erro: "O ato não pode ser maior que a entrada." };
      }
      if (error.message.includes("prazo_meses")) {
        return { erro: "O tempo de Trilha precisa ficar entre 12 e 36 meses." };
      }
      if (error.message.includes("ordem")) {
        return { erro: "São no máximo 4 opções por incorporadora." };
      }
      if (error.message.includes("percentual_comissao")) {
        return { erro: "A comissão precisa ser um percentual entre 0 e 100." };
      }
      return { erro: "Alguma condição não fecha. Revise os percentuais e o prazo." };
    }
    if (error.code === "42501") {
      return { erro: "Você não tem permissão para editar estas opções." };
    }
    if (error.code === "23503") {
      return { erro: "Esse empreendimento não é desta incorporadora." };
    }
    return { erro: detalhar("Não foi possível salvar as opções.", error) };
  }

  revalidatePath("/opcoes-pagamento");
  revalidatePath("/perfil");
  revalidatePath(`/incorporadoras/${incorporadoraId}`);
  if (empreendimentoId) revalidatePath(`/empreendimentos/${empreendimentoId}`);
  return { erro: null };
}
