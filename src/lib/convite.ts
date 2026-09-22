import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { linkDoSite } from "@/lib/site";

/**
 * O convite de primeiro acesso, do lado público.
 *
 * Irmão de `lib/simulador.ts`: quem abre `/primeiro-acesso` não tem sessão
 * nenhuma, então a leitura vai pela chave de servidor. E pela mesma razão vale
 * a mesma regra — a função devolve uma forma FIXA e não aceita "quais campos"
 * nem "qual filtro" como parâmetro. O token é a única entrada.
 */

export const DIAS_DE_CONVITE = 7;

/** Token de convite: aleatório, longo, e impossível de adivinhar somando 1. */
export function novoConvite() {
  const expira = new Date();
  expira.setDate(expira.getDate() + DIAS_DE_CONVITE);

  return { token: randomBytes(24).toString("hex"), expiraEm: expira.toISOString() };
}

/** O link completo do convite. A origem vem de `lib/site.ts`. */
export async function linkDeConvite(token: string): Promise<string> {
  return linkDoSite(`/primeiro-acesso?t=${token}`);
}

export type ConviteAberto = {
  id: string;
  nome: string;
  email: string;
  incorporadora: string;
};

/**
 * Devolve o parceiro de um convite em aberto, ou o motivo de não devolver.
 *
 * `usado` e `expirado` são casos diferentes e a tela diz coisas diferentes:
 * quem já usou precisa fazer login, quem esperou demais precisa de um convite
 * novo. Mandar os dois para a mesma mensagem faz a pessoa tentar a coisa
 * errada.
 */
export async function lerConvite(
  token: string,
): Promise<
  | { ok: true; parceiro: ConviteAberto }
  | { ok: false; motivo: "invalido" | "expirado" | "usado" }
> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("parceiro")
    .select("id, nome, email, conta_id, convite_expira_em, incorporadora (nome)")
    .eq("convite_token", token)
    .maybeSingle<{
      id: string;
      nome: string;
      email: string;
      conta_id: string | null;
      convite_expira_em: string | null;
      incorporadora: { nome: string } | null;
    }>();

  if (!data) return { ok: false, motivo: "invalido" };
  if (data.conta_id) return { ok: false, motivo: "usado" };
  if (data.convite_expira_em && new Date(data.convite_expira_em) < new Date()) {
    return { ok: false, motivo: "expirado" };
  }

  return {
    ok: true,
    parceiro: {
      id: data.id,
      nome: data.nome,
      email: data.email,
      incorporadora: data.incorporadora?.nome ?? "",
    },
  };
}
