import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ehAdmin, getSessao } from "@/lib/sessao";
import { maskCPF, maskPhone } from "@/lib/br";
import { EmptyState, PageHeader } from "@/components/ui";
import ErroLeitura from "@/components/erro-leitura";

type Linha = {
  id: string;
  resp_nome: string;
  resp_cpf: string;
  resp_email: string;
  resp_telefone: string;
  conta_id: string | null;
  empreendimento: { imovel: { count: number }[] }[];
};

/**
 * Proprietários PF: vendedores pessoa física de imóveis avulsos. Exceção, não
 * regra — a lista existe para o sistema dar conta quando aparecer um.
 */
export default async function ProprietariosPage() {
  const sessao = await getSessao();
  if (!ehAdmin(sessao)) redirect("/");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("incorporadora")
    .select("id, resp_nome, resp_cpf, resp_email, resp_telefone, conta_id, empreendimento (imovel (count))")
    .eq("tipo", "proprietario_pf")
    .order("resp_nome")
    .returns<Linha[]>();

  if (error) return <ErroLeitura oQue="dos proprietários" erro={error} />;
  const lista = data ?? [];

  return (
    <>
      <PageHeader
        titulo="Proprietários PF"
        descricao="Vendedores pessoa física, com os imóveis avulsos de cada um."
        acao={{ href: "/proprietarios/novo", label: "Cadastrar proprietário" }}
      />

      {lista.length === 0 ? (
        <EmptyState
          titulo="Nenhum proprietário ainda"
          texto="Cadastre o proprietário e, dentro dele, o imóvel."
          acao={{ href: "/proprietarios/novo", label: "Cadastrar proprietário" }}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead>
              <tr className="border-b border-border">
                {["Proprietário", "CPF", "Contato", "Imóveis", "Acesso"].map((h) => (
                  <th key={h} className="bg-muted/50 px-4 py-2.5 text-xs font-medium whitespace-nowrap text-muted-foreground">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => {
                const imoveis = p.empreendimento.reduce((t, e) => t + (e.imovel[0]?.count ?? 0), 0);
                return (
                  <tr key={p.id} className="border-b border-border transition-colors last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <Link
                        href={`/proprietarios/${p.id}`}
                        className="text-sm font-semibold text-foreground underline-offset-4 hover:underline"
                      >
                        {p.resp_nome}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm tabular-nums text-muted-foreground">{maskCPF(p.resp_cpf)}</td>
                    <td className="px-4 py-3 text-sm">
                      {p.resp_email}
                      <span className="block tabular-nums text-muted-foreground">{maskPhone(p.resp_telefone)}</span>
                    </td>
                    <td className="px-4 py-3 text-sm tabular-nums text-muted-foreground">{imoveis}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {p.conta_id ? "acesso criado" : "sem acesso"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
