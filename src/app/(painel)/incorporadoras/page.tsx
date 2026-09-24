import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessao } from "@/lib/sessao";
import { maskCNPJ, maskPhone, stripMask } from "@/lib/br";
import { EmptyState, PageHeader } from "@/components/ui";
import { Busca } from "@/components/busca";

type Linha = {
  id: string;
  nome: string;
  cnpj: string;
  email: string;
  telefone: string;
  resp_nome: string;
  empreendimento: { count: number }[];
};

/** PostgREST separa condições do `or` por vírgula — então ela não pode passar. */
const limpar = (termo: string) => termo.replace(/[,()*]/g, " ").trim();

export default async function IncorporadorasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sessao = await getSessao();
  if (sessao?.conta && sessao.conta.tipo !== "trilha_admin") redirect("/empreendimentos");

  const { q } = await searchParams;
  const termo = limpar(q ?? "");

  const supabase = await createClient();

  let consulta = supabase
    .from("incorporadora")
    .select("id, nome, cnpj, email, telefone, resp_nome, empreendimento(count)")
    .eq("tipo", "incorporadora")
    .order("nome", { ascending: true });

  if (termo) {
    // Busca no nome da empresa, no nome do responsável e no CNPJ. O CNPJ é
    // guardado só com dígitos, então a máscara digitada é descartada antes.
    const condicoes = [`nome.ilike.*${termo}*`, `resp_nome.ilike.*${termo}*`];
    const digitos = stripMask(termo);
    if (digitos) condicoes.push(`cnpj.ilike.*${digitos}*`);
    consulta = consulta.or(condicoes.join(","));
  }

  const { data } = await consulta.returns<Linha[]>();

  const buscando = Boolean(termo);
  const vazio = !data || data.length === 0;

  return (
    <>
      <PageHeader
        titulo="Incorporadoras"
        acao={{ href: "/incorporadoras/nova", label: "Cadastrar incorporadora" }}
      />

      <div className="mb-5 flex flex-wrap items-center gap-4">
        <Suspense fallback={null}>
          <Busca base="/incorporadoras" placeholder="Buscar por nome, responsável ou CNPJ" />
        </Suspense>
        {buscando ? (
          <span className="text-sm text-muted-foreground">
            {data?.length ?? 0} resultado{(data?.length ?? 0) === 1 ? "" : "s"} para “{termo}”
          </span>
        ) : null}
      </div>

      {vazio ? (
        buscando ? (
          <EmptyState
            titulo="Nenhuma incorporadora encontrada"
            texto={`Nada corresponde a “${termo}”. Tente parte do nome da empresa, o nome do responsável ou o CNPJ.`}
            acao={{ href: "/incorporadoras", label: "Limpar busca" }}
          />
        ) : (
          <EmptyState
            titulo="Nenhuma incorporadora cadastrada"
            texto="Cadastre a primeira incorporadora parceira."
            acao={{ href: "/incorporadoras/nova", label: "Cadastrar a primeira" }}
          />
        )
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead>
              <tr className="border-b border-border">
                {["Incorporadora", "CNPJ", "Responsável", "Empreendimentos", ""].map((h, i) => (
                  <th
                    key={`${h}-${i}`}
                    className="bg-muted/50 px-4 py-2.5 text-xs font-medium whitespace-nowrap text-muted-foreground"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((linha) => (
                <tr
                  key={linha.id}
                  className="border-b border-border last:border-0 hover:bg-accent"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/incorporadoras/${linha.id}`}
                      className="text-sm font-semibold text-foreground underline-offset-4 hover:underline hover:text-foreground"
                    >
                      {linha.nome}
                    </Link>
                    <span className="block text-sm text-muted-foreground">{linha.email}</span>
                  </td>
                  <td className="px-4 py-3 text-sm tabular-nums text-muted-foreground">
                    {maskCNPJ(linha.cnpj)}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {linha.resp_nome}
                    <span className="block text-sm tabular-nums text-muted-foreground">
                      {maskPhone(linha.telefone)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm tabular-nums">
                    <Link
                      href={`/empreendimentos?incorporadora=${linha.id}`}
                      className="text-foreground underline-offset-4 hover:underline hover:text-foreground"
                    >
                      {linha.empreendimento?.[0]?.count ?? 0}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/incorporadoras/${linha.id}/editar`}
                      className="text-sm font-semibold text-foreground underline-offset-4 hover:underline hover:text-foreground"
                    >
                      Editar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
