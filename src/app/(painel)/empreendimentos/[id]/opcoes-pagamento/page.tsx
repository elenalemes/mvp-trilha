import { notFound, redirect } from "next/navigation";
import { getSessao, podeEditar } from "@/lib/sessao";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import FormOpcoesPagamento from "@/components/form-opcoes-pagamento";
import ListaOpcoes from "@/components/lista-opcoes";
import { opcoesPadrao, opcoesProprias } from "@/lib/opcoes";

type Registro = {
  id: string;
  nome: string;
  incorporadora_id: string;
  incorporadora: { nome: string } | null;
};

const paraTexto = (v: number) => String(v).replace(".", ",");

export default async function OpcoesDoEmpreendimentoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const sessao = await getSessao();
  if (!podeEditar(sessao)) redirect("/empreendimentos");

  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("empreendimento")
    .select("id, nome, incorporadora_id, incorporadora(nome)")
    .eq("id", id)
    .maybeSingle<Registro>();

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/20 bg-erro-suave px-5 py-4">
        <p className="text-sm font-semibold text-destructive">
          Não consegui carregar os dados deste empreendimento.
        </p>
        <p className="mt-1 text-sm text-destructive">
          {error.code ?? "sem código"}: {error.message ?? "sem mensagem"}
        </p>
      </div>
    );
  }
  if (!data) notFound();

  const [proprias, padrao] = await Promise.all([
    opcoesProprias(supabase, id),
    opcoesPadrao(supabase, data.incorporadora_id),
  ]);

  return (
    <>
      <PageHeader
        titulo="Condições deste empreendimento"
        descricao={data.nome}
        voltar={{ href: `/empreendimentos/${id}`, label: data.nome }}
      />

      <p className="mb-6 max-w-3xl text-sm text-muted-foreground">
        O que estiver aqui vale <strong className="text-foreground">só para este empreendimento</strong>{" "}
        e substitui o padrão da incorporadora por inteiro — as duas listas nunca se misturam. Deixar
        vazio é voltar a usar o padrão.
      </p>

      {padrao.length > 0 ? (
        <section className="mb-6 rounded-lg border border-border bg-muted/40 p-5">
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
            O padrão de {data.incorporadora?.nome ?? "a incorporadora"}, para comparar
          </h2>
          <ListaOpcoes opcoes={padrao} />
        </section>
      ) : null}

      <FormOpcoesPagamento
        incorporadoraId={data.incorporadora_id}
        empreendimentoId={id}
        voltarPara={`/empreendimentos/${id}`}
        iniciais={proprias.map((o) => ({
          percentual_entrada: paraTexto(o.percentual_entrada),
          percentual_ato: paraTexto(o.percentual_ato),
          prazo_meses: String(o.prazo_meses),
        }))}
      />
    </>
  );
}
