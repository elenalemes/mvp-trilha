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
      <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-4">
        <p className="font-display text-[15px] font-semibold text-red-800">
          O banco recusou a leitura deste empreendimento.
        </p>
        <p className="mt-1 text-sm text-red-700">
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

      <p className="mb-6 max-w-3xl text-[15px] text-trilha-400">
        O que estiver aqui vale <strong className="text-trilha-700">só para este empreendimento</strong>{" "}
        e substitui o padrão da incorporadora por inteiro — as duas listas nunca se misturam. Deixar
        vazio é voltar a usar o padrão.
      </p>

      {padrao.length > 0 ? (
        <section className="mb-6 rounded-lg border border-trilha-200 bg-trilha-50/60 p-5">
          <h2 className="font-display mb-3 text-sm font-semibold tracking-[0.12em] text-trilha-400 uppercase">
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
