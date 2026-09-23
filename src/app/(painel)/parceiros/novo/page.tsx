import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ehAdmin, ehParceiro, getSessao } from "@/lib/sessao";
import { PageHeader } from "@/components/ui";
import ErroLeitura from "@/components/erro-leitura";
import FormParceiro from "@/components/form-parceiro";

/**
 * Cadastrar um parceiro.
 *
 * A incorporadora cai direto no formulário: a incorporadora dele é ela mesma,
 * não há o que perguntar.
 *
 * A Trilha precisa responder isso antes — um parceiro sem incorporadora não
 * existe no modelo. Em vez de um campo de seleção dentro do formulário, a
 * escolha vira um passo próprio, e daí em diante o admin segue pelo caminho
 * que já existe (`/incorporadoras/<id>/parceiros/novo`). Um formulário só,
 * usado por todo mundo, em vez de dois que precisam concordar.
 */
export default async function NovoParceiroPage() {
  const sessao = await getSessao();
  if (ehParceiro(sessao)) redirect("/empreendimentos");

  if (ehAdmin(sessao)) return <EscolherIncorporadora />;

  if (!sessao?.incorporadoraId) {
    return (
      <p className="rounded-md border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
        Esta conta não está ligada a nenhuma incorporadora.
      </p>
    );
  }

  return (
    <>
      <PageHeader
        titulo="Cadastrar parceiro"
        descricao="Ele vai enxergar as suas unidades disponíveis, sem poder alterar nada."
        voltar={{ href: "/parceiros", label: "Parceiros" }}
      />
      <FormParceiro modo="criar" incorporadoraId={sessao.incorporadoraId} voltarPara="/parceiros" />
    </>
  );
}

async function EscolherIncorporadora() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("incorporadora")
    .select("id, nome")
    .order("nome")
    .returns<{ id: string; nome: string }[]>();

  if (error) return <ErroLeitura oQue="das incorporadoras" erro={error} />;

  const incorporadoras = data ?? [];

  return (
    <>
      <PageHeader
        titulo="Cadastrar parceiro"
        descricao="Para qual incorporadora?"
        voltar={{ href: "/parceiros", label: "Parceiros" }}
      />

      {incorporadoras.length === 0 ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          Nenhuma incorporadora cadastrada ainda. O parceiro vende as unidades de uma delas, então
          ela vem primeiro.
        </p>
      ) : (
        <ul className="flex flex-col overflow-hidden rounded-lg border border-border bg-white">
          {incorporadoras.map((i) => (
            <li key={i.id} className="border-b border-border transition-colors last:border-0 hover:bg-muted/40">
              <Link
                href={`/incorporadoras/${i.id}/parceiros/novo`}
                className="flex items-center justify-between gap-4 px-5 py-4 text-[17px] font-semibold text-foreground transition-colors hover:bg-accent"
              >
                {i.nome}
                <span aria-hidden="true" className="text-muted-foreground/70">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
