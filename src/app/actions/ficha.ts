"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessao } from "@/lib/sessao";
import { fichaSchema, type FichaValues } from "@/lib/schemas";
import { stripMask, telefoneNacional, temConjuge } from "@/lib/br";

/**
 * Salvar a ficha de qualificação.
 *
 * Salvar a ficha completa CONCLUI a tarefa — quem faz isso é um trigger no
 * banco, não esta action. Editar depois continua permitido enquanto o negócio
 * estiver aberto: endereço errado se corrige, não se reabre tarefa.
 *
 * Cliente da SESSÃO: a Trilha e o corretor do negócio passam na regra; a
 * incorporadora, não.
 */

export type ResultadoFicha = { ok: true } | { ok: false; erro: string };

const limpo = (v: string) => v.trim();

export async function salvarFicha(negocioId: string, valores: FichaValues): Promise<ResultadoFicha> {
  const lido = fichaSchema.safeParse(valores);
  if (!lido.success) {
    return { ok: false, erro: "Há campos incompletos ou inválidos. Confira os destaques em vermelho." };
  }

  const sessao = await getSessao();
  if (!sessao) return { ok: false, erro: "Sua sessão expirou. Entre de novo." };

  const { comprador: c, conjuge: j } = lido.data;
  const casado = temConjuge(c.estado_civil);

  // Sem cônjuge (nem casado, nem união estável), os campos vão como nulo — a
  // trava `ficha_conjuge` recusa uma ficha de solteiro com cônjuge preenchido,
  // e é o que se quer quando alguém corrige "casado" para "solteiro".
  const conjuge = (valor: string, formato: (v: string) => string = limpo) =>
    casado ? formato(valor) : null;

  const linha = {
    negocio_id: negocioId,
    nome: limpo(c.nome),
    email: limpo(c.email).toLowerCase(),
    telefone: telefoneNacional(c.telefone),
    cpf: stripMask(c.cpf),
    rg: limpo(c.rg),
    rg_emissor: limpo(c.rg_emissor),
    endereco: limpo(c.endereco),
    profissao: limpo(c.profissao),
    estado_civil: c.estado_civil,
    regime_bens: casado ? (c.regime_bens ?? null) : null,
    conjuge_nome: conjuge(j.nome),
    conjuge_email: conjuge(j.email, (v) => limpo(v).toLowerCase()),
    conjuge_telefone: conjuge(j.telefone, telefoneNacional),
    conjuge_cpf: conjuge(j.cpf, stripMask),
    conjuge_rg: conjuge(j.rg),
    conjuge_rg_emissor: conjuge(j.rg_emissor),
    conjuge_endereco: conjuge(j.endereco),
    conjuge_profissao: conjuge(j.profissao),
    preenchida_por: sessao.usuarioId,
  };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("ficha_qualificacao")
    .upsert(linha, { onConflict: "negocio_id" })
    .select("negocio_id")
    .maybeSingle<{ negocio_id: string }>();

  if (error || !data) {
    if (error?.code === "42501" || !error) {
      return { ok: false, erro: "Você não pode editar esta ficha. O negócio pode ter sido cancelado." };
    }
    if (error.code === "23514") {
      return { ok: false, erro: "Casado ou união estável exigem regime de bens e os dados do cônjuge." };
    }
    console.error("[ficha] gravação recusada:", error);
    return { ok: false, erro: "Não consegui salvar a ficha. Tente de novo em instantes." };
  }

  revalidatePath(`/negocios/${negocioId}`);
  return { ok: true };
}
