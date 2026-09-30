import { redirect } from "next/navigation";
import { ehAdmin, getSessao } from "@/lib/sessao";

/**
 * A lista de incorporadoras virou um filtro de `/vendedores`.
 *
 * A rota fica de pé como redirecionamento porque ela está em links antigos, em
 * favoritos e no "voltar" de várias telas filhas — e porque `/incorporadoras`
 * continua sendo a casa das FICHAS (`/incorporadoras/[id]`, `/nova`,
 * `/[id]/editar`, `/[id]/parceiros`), que não se unificaram e nem deviam.
 */
export default async function IncorporadorasPage() {
  const sessao = await getSessao();
  if (!ehAdmin(sessao)) redirect("/empreendimentos");
  redirect("/vendedores?tipo=incorporadora");
}
