import { redirect } from "next/navigation";
import { ehAdmin, getSessao } from "@/lib/sessao";

/** A lista de proprietários PF virou um filtro de `/vendedores`. Ver `incorporadoras/page.tsx`. */
export default async function ProprietariosPage() {
  const sessao = await getSessao();
  if (!ehAdmin(sessao)) redirect("/");
  redirect("/vendedores?tipo=proprietario_pf");
}
