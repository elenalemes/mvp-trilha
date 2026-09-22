import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ehAdmin, getSessao } from "@/lib/sessao";
import { maskCNPJ, maskCPF, maskPhone } from "@/lib/br";
import type { Condicao } from "@/lib/pagamento";
import CardPagamento from "@/components/card-pagamento";
import { PageHeader } from "@/components/ui";
import { SituacaoProposta } from "@/components/situacao-proposta";
import DecisaoProposta from "@/components/decisao-proposta";

/**
 * A ficha da proposta.
 *
 * O card da esquerda é montado a partir do `condicao` guardado em jsonb, e não
 * recalculado: é a tela que o cliente viu no dia, reconstruída. Se a
 * incorporadora mudou o preço desde então, esta ficha continua mostrando o que
 * foi proposto — que é justamente o ponto de ter congelado.
 */
export const dynamic = "force-dynamic";

type Ficha = {
  id: string;
  codigo: string;
  status: string;
  created_at: string;
  observacao: string | null;
  motivo_decisao: string | null;
  decidida_em: string | null;
  valor_imovel: number;
  escopo: string;
  condicao: Condicao;
  imovel: { id: string; identificacao: string; status: string } | null;
  empreendimento: { id: string; nome: string } | null;
  incorporadora: { id: string; nome: string } | null;
  parceiro: {
    id: string;
    nome: string;
    email: string;
    telefone: string;
    documento: string | null;
    creci: string | null;
    ativo: boolean;
    origem: string;
    incorporadora_id: string;
  } | null;
  comprador: { nome: string; cpf: string; email: string; telefone: string } | null;
};

const ABERTAS = ["enviada", "em_analise"];

const documentoFormatado = (v: string | null) =>
  !v ? "—" : v.length > 11 ? maskCNPJ(v) : maskCPF(v);

export default async function PropostaDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const sessao = await getSessao();
  if (!ehAdmin(sessao)) redirect("/empreendimentos");

  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("proposta")
    .select(
      `id, codigo, status, created_at, observacao, motivo_decisao, decidida_em,
       valor_imovel, escopo, condicao,
       imovel (id, identificacao, status),
       empreendimento (id, nome),
       incorporadora (id, nome),
       parceiro (id, nome, email, telefone, documento, creci, ativo, origem, incorporadora_id),
       comprador (nome, cpf, email, telefone)`,
    )
    .eq("id", id)
    .maybeSingle<Ficha>();

  if (!data) notFound();

  const { parceiro, comprador, imovel, empreendimento, incorporadora } = data;
  const aberta = ABERTAS.includes(data.status);
  const pendente = parceiro?.origem === "proposta" && !parceiro.ativo;

  return (
    <>
      <PageHeader
        titulo={data.codigo}
        descricao={`${imovel?.identificacao ?? "—"} · ${empreendimento?.nome ?? "—"} · ${incorporadora?.nome ?? "—"}`}
        voltar={{ href: "/propostas", label: "Propostas" }}
      />

      <div className="mb-6 flex flex-wrap items-center gap-3 text-sm text-trilha-400">
        <SituacaoProposta status={data.status} />
        <span>
          enviada em {new Date(data.created_at).toLocaleString("pt-BR")}
          {data.decidida_em
            ? ` · decidida em ${new Date(data.decidida_em).toLocaleString("pt-BR")}`
            : ""}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start">
        <div className="lg:sticky lg:top-8">
          <CardPagamento condicao={data.condicao} modo="completo" />
          <p className="mt-3 text-xs text-trilha-400">
            Números congelados no envio. Condição{" "}
            {data.escopo === "empreendimento" ? "própria do empreendimento" : "padrão da incorporadora"}.
          </p>
        </div>

        <div className="flex flex-col gap-6">
          {aberta ? (
            <DecisaoProposta id={data.id} unidade={imovel?.identificacao ?? "—"} />
          ) : data.motivo_decisao ? (
            <Bloco titulo="Motivo da decisão">
              <p className="text-[15px] text-trilha-900">{data.motivo_decisao}</p>
            </Bloco>
          ) : null}

          <Bloco titulo="O comprador">
            {comprador ? (
              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                <Dado termo="Nome" valor={comprador.nome} />
                <Dado termo="CPF" valor={maskCPF(comprador.cpf)} />
                <Dado termo="E-mail" valor={comprador.email} />
                <Dado termo="Telefone" valor={maskPhone(comprador.telefone)} />
              </dl>
            ) : (
              <p className="text-[15px] text-trilha-400">Sem dados.</p>
            )}
          </Bloco>

          <Bloco titulo="O corretor">
            {parceiro ? (
              <>
                {pendente ? (
                  <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    Este cadastro nasceu desta proposta e <strong>ainda não tem acesso</strong>. Se
                    o corretor for aprovado, crie o login dele na ficha do parceiro.
                  </p>
                ) : null}

                <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                  <Dado termo="Nome" valor={parceiro.nome} />
                  <Dado termo="CPF / CNPJ" valor={documentoFormatado(parceiro.documento)} />
                  <Dado termo="CRECI" valor={parceiro.creci ?? "—"} />
                  <Dado termo="Telefone" valor={maskPhone(parceiro.telefone)} />
                  <Dado termo="E-mail" valor={parceiro.email} />
                </dl>

                <p className="mt-4">
                  <Link
                    href={`/incorporadoras/${parceiro.incorporadora_id}/parceiros/${parceiro.id}/editar`}
                    className="font-display text-sm font-semibold tracking-wide text-trilha-500 uppercase underline underline-offset-2 hover:text-trilha-700"
                  >
                    Abrir ficha do parceiro
                  </Link>
                </p>
              </>
            ) : (
              <p className="text-[15px] text-trilha-400">Sem dados.</p>
            )}
          </Bloco>

          {data.observacao ? (
            <Bloco titulo="Observação do corretor">
              <p className="text-[15px] whitespace-pre-line text-trilha-900">{data.observacao}</p>
            </Bloco>
          ) : null}

          <Bloco titulo="A unidade">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              <Dado termo="Unidade" valor={imovel?.identificacao ?? "—"} />
              <Dado termo="Situação hoje" valor={imovel?.status ?? "—"} />
            </dl>
            {empreendimento && imovel ? (
              <p className="mt-4">
                <Link
                  href={`/empreendimentos/${empreendimento.id}/imoveis/${imovel.id}`}
                  className="font-display text-sm font-semibold tracking-wide text-trilha-500 uppercase underline underline-offset-2 hover:text-trilha-700"
                >
                  Abrir a unidade
                </Link>
              </p>
            ) : null}
          </Bloco>
        </div>
      </div>
    </>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-trilha-200 bg-white p-6">
      <h2 className="font-display mb-4 text-sm font-semibold tracking-[0.12em] text-trilha-400 uppercase">
        {titulo}
      </h2>
      {children}
    </section>
  );
}

function Dado({ termo, valor }: { termo: string; valor: string }) {
  return (
    <div>
      <dt className="text-sm text-trilha-400">{termo}</dt>
      <dd className="text-[15px] text-trilha-900">{valor}</dd>
    </div>
  );
}
