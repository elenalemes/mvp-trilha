"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessao } from "@/lib/sessao";
import { BUCKET_FECHAMENTO, caminhoPertence } from "@/lib/armazenamento";
import type { Pessoa } from "@/lib/fechamento";

/**
 * O registro dos arquivos do fechamento.
 *
 * O conteúdo já subiu do navegador direto para o Storage; aqui só se grava a
 * linha que a tela lê. As duas coisas são separadas porque o arquivo não passa
 * pela Vercel — e por isso mesmo a action não confia no que recebe: confere
 * que o caminho é daquela tarefa, e a policy da tabela confere de novo.
 *
 * Cliente da SESSÃO, sempre: quem decide é a regra do banco.
 */

export type ResultadoArquivo = { ok: true } | { ok: false; erro: string };

type Dados = {
  caminho: string;
  nome: string;
  tipo: string;
  tamanho: number;
  /** De quem é, nos documentos do comprador. O banco ignora nas outras tarefas. */
  pessoa?: Pessoa;
};

function revalidar(negocioId: string) {
  revalidatePath(`/negocios/${negocioId}`);
}

export async function registrarArquivo(
  tarefaId: string,
  negocioId: string,
  dados: Dados,
): Promise<ResultadoArquivo> {
  if (!caminhoPertence(dados.caminho, negocioId, tarefaId)) {
    return { ok: false, erro: "O arquivo não pertence a esta tarefa." };
  }

  const sessao = await getSessao();
  if (!sessao) return { ok: false, erro: "Sua sessão expirou. Entre de novo." };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("checklist_arquivo")
    .insert({
      checklist_item_id: tarefaId,
      negocio_id: negocioId,
      caminho: dados.caminho,
      nome_original: dados.nome.slice(0, 200),
      tipo_mime: dados.tipo,
      tamanho_bytes: dados.tamanho,
      pessoa: dados.pessoa ?? null,
      enviado_por: sessao.usuarioId,
    })
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error || !data) {
    if (error?.code === "42501") {
      return { ok: false, erro: "Você não pode anexar arquivo nesta tarefa agora." };
    }
    console.error("[arquivos] registro recusado:", error);
    return { ok: false, erro: "O arquivo subiu, mas não consegui registrá-lo. Tente de novo." };
  }

  revalidar(negocioId);
  return { ok: true };
}

/**
 * Remover um arquivo.
 *
 * A LINHA sai primeiro, o objeto depois. Na ordem inversa, uma falha no meio
 * deixaria na tela um arquivo que não abre; nesta ordem, o pior caso é um
 * objeto órfão no bucket, que ninguém vê e só ocupa espaço.
 *
 * Remover o ÚLTIMO arquivo de um documento devolve a tarefa para pendente —
 * quem faz isso é um trigger no banco. A regra de quem pode é do banco; a tela
 * só esconde o botão.
 */
export async function removerArquivo(arquivoId: string, negocioId: string): Promise<ResultadoArquivo> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("checklist_arquivo")
    .delete()
    .eq("id", arquivoId)
    .select("caminho")
    .maybeSingle<{ caminho: string }>();

  // Sem erro e sem linha = a policy filtrou: tarefa concluída ou não é sua.
  if (error || !data) {
    if (error) console.error("[arquivos] remoção recusada:", error);
    return {
      ok: false,
      erro: "Não dá para remover este arquivo. Só quem é responsável pela tarefa remove, e nunca num negócio cancelado.",
    };
  }

  const { error: erroObjeto } = await supabase.storage.from(BUCKET_FECHAMENTO).remove([data.caminho]);
  if (erroObjeto) console.error("[arquivos] objeto ficou órfão no bucket:", data.caminho, erroObjeto);

  revalidar(negocioId);
  return { ok: true };
}

/**
 * Trocar de quem é um arquivo — foi anexado como do comprador e é do cônjuge.
 *
 * O banco só deixa mudar esta coluna, e só para quem mexe nos anexos da
 * tarefa. O arquivo em si não muda.
 */
export async function marcarPessoa(
  arquivoId: string,
  negocioId: string,
  pessoa: Pessoa,
): Promise<ResultadoArquivo> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("checklist_arquivo")
    .update({ pessoa })
    .eq("id", arquivoId)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error || !data) {
    if (error) console.error("[arquivos] marcação recusada:", error);
    return { ok: false, erro: "Não consegui trocar a marcação deste arquivo." };
  }

  revalidar(negocioId);
  return { ok: true };
}
