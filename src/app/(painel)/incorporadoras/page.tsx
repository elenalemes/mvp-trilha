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
        descricao="Parceiras cadastradas, em ordem alfabética. Cada uma tem seu próprio acesso à plataforma."
        acao={{ href: "/incorporadoras/nova", label: "Cadastrar incorporadora" }}
      />

      <div className="mb-5 flex flex-wrap items-center gap-4">
        <Suspense fallback={null}>
          <Busca base="/incorporadoras" placeholder="Buscar por nome, responsável ou CNPJ" />
        </Suspense>
        {buscando ? (
          <span className="text-sm text-trilha-400">
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
            texto="O cadastro reúne os dados da empresa, os dados bancários para repasse, o responsável e o acesso que ela vai usar para entrar."
            acao={{ href: "/incorporadoras/nova", label: "Cadastrar a primeira" }}
          />
        )
      ) : (
        <div className="overflow-x-auto rounded-lg border border-trilha-200 bg-white">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead>
              <tr className="border-b border-trilha-100">
                {["Incorporadora", "CNPJ", "Responsável", "Empreendimentos", ""].map((h, i) => (
                  <th
                    key={`${h}-${i}`}
                    className="font-display px-5 py-3 text-sm font-semibold tracking-wide text-trilha-400 uppercase"
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
                  className="border-b border-trilha-100 last:border-0 hover:bg-trilha-50"
                >
                  <td className="px-5 py-4">
                    <Link
                      href={`/incorporadoras/${linha.id}`}
                      className="font-display text-[17px] font-semibold text-trilha-700 underline underline-offset-2 hover:text-trilha-500"
                    >
                      {linha.nome}
                    </Link>
                    <span className="block text-sm text-trilha-400">{linha.email}</span>
                  </td>
                  <td className="px-5 py-4 text-[15px] tabular-nums text-trilha-400">
                    {maskCNPJ(linha.cnpj)}
                  </td>
                  <td className="px-5 py-4 text-[15px]">
                    {linha.resp_nome}
                    <span className="block text-sm tabular-nums text-trilha-400">
                      {maskPhone(linha.telefone)}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-[15px] tabular-nums">
                    <Link
                      href={`/empreendimentos?incorporadora=${linha.id}`}
                      className="text-trilha-500 underline underline-offset-2 hover:text-trilha-700"
                    >
                      {linha.empreendimento?.[0]?.count ?? 0}
                    </Link>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Link
                      href={`/incorporadoras/${linha.id}/editar`}
                      className="font-display text-sm font-semibold tracking-wide text-trilha-500 uppercase underline underline-offset-2 hover:text-trilha-700"
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
