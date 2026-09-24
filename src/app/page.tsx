import { redirect } from "next/navigation";
import { ehParceiroTrilha, ehProprietarioPF, getSessao } from "@/lib/sessao";

export default async function Home() {
  const sessao = await getSessao();
  // O admin cai na importação: é o primeiro passo de toda parceria nova e o
  // caminho por onde o estoque entra no sistema.
  // O Parceiro Trilha não tem estoque "dele" no painel — cai nas propostas.
  if (sessao?.conta?.tipo === "trilha_admin") redirect("/importacao");
  if (ehProprietarioPF(sessao)) redirect(`/proprietarios/${sessao!.incorporadoraId}`);
  redirect(ehParceiroTrilha(sessao) ? "/propostas" : "/empreendimentos");
}
