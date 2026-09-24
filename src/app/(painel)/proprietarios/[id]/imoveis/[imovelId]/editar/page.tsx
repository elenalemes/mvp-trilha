import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ehAdmin, getSessao } from "@/lib/sessao";
import { PageHeader } from "@/components/ui";
import FormImovel from "@/components/form-imovel";
import type { ImovelFormValues } from "@/lib/schemas";

type Registro = {
  empreendimento_id: string;
  identificacao: string;
  tipologia: string | null;
  observacao: string | null;
  numero_matricula: string | null;
  tipo: ImovelFormValues["tipo"];
  status: ImovelFormValues["status"];
  valor: number | null;
  metros_quadrados: number | null;
  area_total: number | null;
  area_garden: number | null;
  posicao_solar: string | null;
  num_quartos: number | null;
  num_suites: number | null;
  num_banheiros: number | null;
  num_vagas: number | null;
  matricula_vaga: string | null;
  sacada: boolean;
  churrasqueira: boolean;
  empreendimento: { nome: string; incorporadora_id: string } | null;
};

const dec = (v: number | null) => (v === null || v === undefined ? "" : String(v).replace(".", ","));
const int = (v: number | null) => (v === null || v === undefined ? "" : String(v));

export default async function EditarImovelAvulsoPage({
  params,
}: {
  params: Promise<{ id: string; imovelId: string }>;
}) {
  const sessao = await getSessao();
  if (!ehAdmin(sessao)) redirect("/");

  const { id, imovelId } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("imovel")
    .select(
      `empreendimento_id, identificacao, tipologia, observacao, numero_matricula,
       tipo, status, valor, metros_quadrados, area_total, area_garden, posicao_solar,
       num_quartos, num_suites, num_banheiros, num_vagas, matricula_vaga,
       sacada, churrasqueira, empreendimento (nome, incorporadora_id)`,
    )
    .eq("id", imovelId)
    .maybeSingle<Registro>();

  if (!data || data.empreendimento?.incorporadora_id !== id) notFound();

  return (
    <>
      <PageHeader
        titulo={`Editar ${data.identificacao}`}
        descricao={data.empreendimento?.nome}
        voltar={{ href: `/proprietarios/${id}`, label: "Voltar" }}
      />
      <FormImovel
        modo="editar"
        id={imovelId}
        empreendimentoId={data.empreendimento_id}
        voltarPara={`/proprietarios/${id}`}
        inicial={{
          empreendimento_id: data.empreendimento_id,
          identificacao: data.identificacao,
          tipologia: data.tipologia ?? "",
          observacao: data.observacao ?? "",
          numero_matricula: data.numero_matricula ?? "",
          tipo: data.tipo,
          status: data.status,
          valor: dec(data.valor),
          metros_quadrados: dec(data.metros_quadrados),
          area_total: dec(data.area_total),
          area_garden: dec(data.area_garden),
          posicao_solar: data.posicao_solar ?? "",
          num_quartos: int(data.num_quartos),
          num_suites: int(data.num_suites),
          num_banheiros: int(data.num_banheiros),
          num_vagas: int(data.num_vagas),
          matricula_vaga: data.matricula_vaga ?? "",
          sacada: data.sacada,
          churrasqueira: data.churrasqueira,
        }}
      />
    </>
  );
}
