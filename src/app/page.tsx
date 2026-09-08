import { redirect } from "next/navigation";
import { getSessao } from "@/lib/sessao";

export default async function Home() {
  const sessao = await getSessao();
  // O admin cai na importação: é o primeiro passo de toda parceria nova e o
  // caminho por onde o estoque entra no sistema.
  redirect(sessao?.conta?.tipo === "trilha_admin" ? "/importacao" : "/empreendimentos");
}
