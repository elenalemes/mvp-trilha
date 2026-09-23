"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessao } from "@/lib/sessao";

/**
 * As escritas do checklist de fechamento.
 *
 * ATENÇÃO a uma regra do sistema que muda aqui: até esta sprint o parceiro
 * imobiliário era somente-leitura em TODO lugar — não existia nenhuma policy
 * de escrita para ele em tabela nenhuma. Agora existe uma, e só uma: ele
 * atualiza as tarefas de fechamento que são dele, nos negócios que são dele.
 * Foi uma decisão, não um descuido: quem junta a documentação do comprador é o
 * corretor, e não há terceiro para fazer isso por ele.
 *
 * Quem impede o resto continua sendo o banco. Estas actions usam o cliente da
 * SESSÃO de propósito: se a policy não deixar, a escrita não acontece, por
 * mais que a tela tenha mostrado o botão.
 */

export type ResultadoTarefa = { ok: true } | { ok: false; erro: string };

type DadosConclusao = {
  referencia_externa?: string;
  observacao?: string;
  emitido_em?: string;
  valido_ate?: string;
};

const texto = (v: string | undefined) => v?.trim() || null;
/** Campo de data vazio precisa virar null: string vazia o Postgres recusa. */
const data = (v: string | undefined) => (v && v.trim() ? v : null);

function falhou(error: { code?: string; message?: string } | null): string {
  // Documento sem anexo: o trigger do banco explica, e a frase dele serve.
  if (error?.code === "23514" && error.message) return error.message;
  if (error?.code === "42501" || error?.code === "PGRST116") {
    return "Esta tarefa não é sua. Só quem é responsável por ela pode marcá-la.";
  }
  console.error("[fechamento] escrita recusada:", error);
  return "Não consegui salvar. Tente de novo em instantes.";
}

function revalidar(negocioId: string) {
  revalidatePath("/negocios");
  revalidatePath(`/negocios/${negocioId}`);
}

/**
 * Cancelar o negócio.
 *
 * Três escritas que não podem ficar pela metade — negócio, proposta e imóvel —
 * então quem faz é a função do banco, numa transação. Aqui só chega o destino
 * da unidade, que é a decisão de quem cancela: volta para a prateleira, ou sai
 * do estoque de vez.
 */
export async function cancelarNegocio(
  negocioId: string,
  motivo: string,
  destino: "disponivel" | "indisponivel",
): Promise<ResultadoTarefa> {
  if (!motivo.trim()) return { ok: false, erro: "Escreva o motivo do cancelamento." };

  const supabase = await createClient();

  const { error } = await supabase.rpc("cancelar_negocio", {
    p_negocio: negocioId,
    p_motivo: motivo.trim(),
    p_destino: destino,
  });

  if (error) {
    if (["42501", "22023", "P0002"].includes(error.code ?? "")) {
      return { ok: false, erro: error.message ?? "Não foi possível cancelar." };
    }
    console.error("[fechamento] falha ao cancelar:", error);
    return { ok: false, erro: "Não consegui cancelar o negócio. Tente de novo em instantes." };
  }

  revalidar(negocioId);
  revalidatePath("/propostas");
  revalidatePath("/empreendimentos");
  revalidatePath("/imoveis");
  return { ok: true };
}

/** Marcar uma tarefa como feita. Vale para documento e para confirmação. */
export async function concluirTarefa(
  tarefaId: string,
  negocioId: string,
  dados: DadosConclusao,
): Promise<ResultadoTarefa> {
  const sessao = await getSessao();
  const supabase = await createClient();

  const { data: linha, error } = await supabase
    .from("checklist_item")
    .update({
      status: "concluido",
      referencia_externa: texto(dados.referencia_externa),
      observacao: texto(dados.observacao),
      emitido_em: data(dados.emitido_em),
      valido_ate: data(dados.valido_ate),
      concluido_por: sessao?.usuarioId ?? null,
      concluido_em: new Date().toISOString(),
    })
    .eq("id", tarefaId)
    .select("id")
    .maybeSingle<{ id: string }>();

  // Sem erro e sem linha = a policy filtrou. Para o banco a tarefa não existe
  // para quem pediu, e é assim que deve ser.
  if (error || !linha) return { ok: false, erro: falhou(error) };

  revalidar(negocioId);
  return { ok: true };
}

/**
 * O veredito.
 *
 * Aprovado fecha a tarefa. Reprovado NÃO fecha nada — ele deixa a tarefa
 * marcada e o fechamento parado, de propósito: crédito reprovado é o fim do
 * negócio, e cancelar negócio mexe na proposta e devolve o imóvel ao estoque.
 * Isso é uma transação, não um update, e está no item A6 do backlog.
 */
export async function registrarVeredito(
  tarefaId: string,
  negocioId: string,
  aprovado: boolean,
  observacao?: string,
): Promise<ResultadoTarefa> {
  const sessao = await getSessao();
  const supabase = await createClient();

  const { data: linha, error } = await supabase
    .from("checklist_item")
    .update({
      status: aprovado ? "concluido" : "reprovado",
      observacao: texto(observacao),
      concluido_por: sessao?.usuarioId ?? null,
      concluido_em: new Date().toISOString(),
    })
    .eq("id", tarefaId)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error || !linha) return { ok: false, erro: falhou(error) };

  revalidar(negocioId);
  return { ok: true };
}

/**
 * Desfazer.
 *
 * Existe porque marcar errado acontece, e um checklist sem volta é um
 * checklist em que as pessoas param de marcar por medo de errar.
 */
export async function reabrirTarefa(
  tarefaId: string,
  negocioId: string,
): Promise<ResultadoTarefa> {
  const supabase = await createClient();

  const { data: linha, error } = await supabase
    .from("checklist_item")
    .update({
      status: "pendente",
      concluido_por: null,
      concluido_em: null,
    })
    .eq("id", tarefaId)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error || !linha) return { ok: false, erro: falhou(error) };

  revalidar(negocioId);
  return { ok: true };
}

/**
 * Corrigir a validade de um documento.
 *
 * Ao anexar, o banco preenche 30 dias a partir do envio — uma estimativa. Quem
 * tem o papel na mão sabe a data real, e é por aqui que ela entra.
 */
export async function definirValidade(
  tarefaId: string,
  negocioId: string,
  validoAte: string,
): Promise<ResultadoTarefa> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(validoAte)) return { ok: false, erro: "Data inválida." };

  const supabase = await createClient();
  const { data: linha, error } = await supabase
    .from("checklist_item")
    .update({ valido_ate: validoAte })
    .eq("id", tarefaId)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error || !linha) return { ok: false, erro: falhou(error) };

  revalidar(negocioId);
  return { ok: true };
}

/** Nº da apólice, link do Autentique, id da cobrança — o que servir para achar depois. */
export async function salvarReferencia(
  tarefaId: string,
  negocioId: string,
  referencia: string,
): Promise<ResultadoTarefa> {
  const supabase = await createClient();
  const { data: linha, error } = await supabase
    .from("checklist_item")
    .update({ referencia_externa: texto(referencia) })
    .eq("id", tarefaId)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error || !linha) return { ok: false, erro: falhou(error) };

  revalidar(negocioId);
  return { ok: true };
}
