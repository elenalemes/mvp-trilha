import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ehAdmin, getSessao } from "@/lib/sessao";
import { PageHeader } from "@/components/ui";
import FormLocalAvulso from "@/components/form-local-avulso";
import FormImovel, { IMOVEL_VAZIO } from "@/components/form-imovel";

/**
 * Cadastrar imóvel avulso em dois passos: onde fica (condomínio/edifício) e,
 * depois, a unidade. O primeiro passo pula quando já se sabe o local (`?e=`).
 */
export default async function NovoImovelAvulsoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ e?: string }>;
}) {
  const sessao = await getSessao();
  if (!ehAdmin(sessao)) redirect("/");

  const { id } = await params;
  const { e } = await searchParams;
  const supabase = await createClient();

  const [{ data: dono }, { data: locais }] = await Promise.all([
    supabase
      .from("incorporadora")
      .select("resp_nome")
      .eq("id", id)
      .eq("tipo", "proprietario_pf")
      .maybeSingle<{ resp_nome: string }>(),
    supabase
      .from("empreendimento")
      .select("id, nome")
      .eq("incorporadora_id", id)
      .order("nome")
      .returns<{ id: string; nome: string }[]>(),
  ]);
  if (!dono) notFound();

  const local = e ? (locais ?? []).find((l) => l.id === e) : undefined;
  const voltar = { href: `/proprietarios/${id}`, label: dono.resp_nome };

  if (local) {
    return (
      <>
        <PageHeader titulo="Cadastrar imóvel" descricao={local.nome} voltar={voltar} />
        <FormImovel
          modo="criar"
          empreendimentoId={local.id}
          voltarPara={`/proprietarios/${id}`}
          inicial={{ empreendimento_id: local.id, ...IMOVEL_VAZIO }}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader titulo="Cadastrar imóvel" descricao={dono.resp_nome} voltar={voltar} />

      {(locais ?? []).length > 0 ? (
        <div className="mb-6 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Em um local que já existe:</span>
          {(locais ?? []).map((l) => (
            <Link
              key={l.id}
              href={`/proprietarios/${id}/imoveis/novo?e=${l.id}`}
              className="rounded-full border px-3 py-1 font-medium text-foreground transition-colors hover:bg-muted"
            >
              {l.nome}
            </Link>
          ))}
        </div>
      ) : null}

      <FormLocalAvulso proprietarioId={id} destino={`/proprietarios/${id}/imoveis/novo?e={id}`} />
    </>
  );
}
