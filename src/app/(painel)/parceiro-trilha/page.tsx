import { redirect } from "next/navigation";
import { ehAdmin, getSessao } from "@/lib/sessao";

/**
 * A lista de Parceiros Trilha virou um filtro de `/parceiros`.
 *
 * No banco nunca existiram dois tipos de parceiro: existe um, com
 * `incorporadora_id` ou sem. Esta tela era a mesma consulta com um
 * `.is(incorporadora_id, null)` — duas páginas para uma entidade.
 *
 * A rota continua de pé para as telas filhas, que são de verdade diferentes:
 * cadastrar um Parceiro Trilha não pede incorporadora.
 */
export default async function ParceiroTrilhaPage() {
  const sessao = await getSessao();
  if (!ehAdmin(sessao)) redirect("/");
  redirect("/parceiros?tipo=trilha");
}
