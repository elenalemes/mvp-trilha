import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ehAdmin, ehParceiro, getSessao } from "@/lib/sessao";
import { formatBRL, maskCNPJ, maskCPF, maskPhone } from "@/lib/br";
import { dividirComissao, type Condicao } from "@/lib/pagamento";
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
  condicao_especial: boolean;
  motivo_condicao: string | null;
  valor_tabela: number | null;
  imovel: { id: string; identificacao: string; status: string } | null;
  empreendimento: { id: string; nome: string } | null;
  incorporadora: { id: string; nome: string; tipo: string } | null;
  parceiro: {
    id: string;
    nome: string;
    email: string;
    telefone: string;
    documento: string | null;
    creci: string | null;
    ativo: boolean;
    origem: string;
    incorporadora_id: string | null;
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
  const admin = ehAdmin(sessao);
  const corretor = ehParceiro(sessao);

  // O corretor abre a ficha da PRÓPRIA proposta — a policy já garante que ele
  // não alcança as dos outros. O que ele não tem é a decisão: aceitar e
  // recusar são da Trilha.
  if (!admin && !corretor) redirect("/empreendimentos");

  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("proposta")
    .select(
      `id, codigo, status, created_at, observacao, motivo_decisao, decidida_em,
       valor_imovel, escopo, condicao, condicao_especial, motivo_condicao, valor_tabela,
       imovel (id, identificacao, status),
       empreendimento (id, nome),
       incorporadora (id, nome, tipo),
       parceiro!parceiro_id (id, nome, email, telefone, documento, creci, ativo, origem, incorporadora_id),
       comprador (nome, cpf, email, telefone)`,
    )
    .eq("id", id)
    .maybeSingle<Ficha>();

  if (!data) notFound();

  const { parceiro, comprador, imovel, empreendimento, incorporadora } = data;

  const { data: divisao } = await supabase
    .from("proposta_corretor")
    .select("parceiro_id, percentual, parceiro (nome)")
    .eq("proposta_id", data.id)
    .order("principal", { ascending: false })
    .returns<{ parceiro_id: string; percentual: number; parceiro: { nome: string } | null }[]>();
  const aberta = ABERTAS.includes(data.status);
  const pendente = parceiro?.origem === "proposta" && !parceiro.ativo;

  return (
    <>
      <PageHeader
        titulo={data.codigo}
        descricao={`${imovel?.identificacao ?? "—"} · ${empreendimento?.nome ?? "—"} · ${incorporadora?.nome ?? "—"}`}
        voltar={{ href: "/propostas", label: "Propostas" }}
      />

      <div className="mb-6 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
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
          <CardPagamento
            condicao={data.condicao}
            modo="completo"
            vendaDireta={!parceiro}
            especial={data.condicao_especial}
            proprietarioPF={data.incorporadora?.tipo === "proprietario_pf"}
            divisao={
              divisao && divisao.length && admin
                ? dividirComissao(
                    data.condicao,
                    divisao.map((d) => ({ parceiroId: d.parceiro_id, nome: d.parceiro?.nome ?? "", pontos: Number(d.percentual) })),
                  )
                : undefined
            }
          />
          <p className="mt-3 text-xs text-muted-foreground">
            Números congelados no envio.{" "}
            {data.condicao_especial
              ? "Condição especial, definida pela Trilha."
              : `Condição ${data.escopo === "empreendimento" ? "própria do empreendimento" : "padrão da incorporadora"}.`}
            {data.condicao_especial && data.valor_tabela && Number(data.valor_tabela) !== Number(data.valor_imovel)
              ? ` Valor negociado ${formatBRL(data.valor_imovel)} (cadastro: ${formatBRL(data.valor_tabela)}).`
              : ""}
          </p>
          {data.motivo_condicao && admin ? (
            <p className="mt-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">{data.motivo_condicao}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-6">
          {aberta && admin ? (
            <DecisaoProposta id={data.id} unidade={imovel?.identificacao ?? "—"} />
          ) : aberta && corretor ? (
            <Bloco titulo="Situação">
              <p className="text-sm text-foreground">
                Em análise pela Trilha. A decisão aparece aqui.
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Até lá, a unidade continua disponível para outras propostas.
              </p>
            </Bloco>
          ) : data.motivo_decisao ? (
            <Bloco titulo="Motivo da decisão">
              <p className="text-sm text-foreground">{data.motivo_decisao}</p>
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
              <p className="text-sm text-muted-foreground">Sem dados.</p>
            )}
          </Bloco>

          <Bloco titulo={corretor ? "Você" : "O corretor"}>
            {parceiro ? (
              <>
                {pendente ? (
                  <p className="mb-4 rounded-md border border-aviso/20 bg-aviso-suave px-4 py-3 text-sm text-aviso">
                    Este cadastro nasceu desta proposta e <strong>ainda não tem acesso</strong>. Se
                    o corretor for aprovado, crie o login dele na ficha do parceiro.
                  </p>
                ) : null}

                <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                  <Dado
                    termo="Nome"
                    valor={parceiro.incorporadora_id ? parceiro.nome : `${parceiro.nome} · Parceiro Trilha`}
                  />
                  <Dado termo="CPF / CNPJ" valor={documentoFormatado(parceiro.documento)} />
                  <Dado termo="CRECI" valor={parceiro.creci ?? "—"} />
                  <Dado termo="Telefone" valor={maskPhone(parceiro.telefone)} />
                  <Dado termo="E-mail" valor={parceiro.email} />
                </dl>

                {admin ? (
                <p className="mt-4">
                  <Link
                    href={`${parceiro.incorporadora_id ? "/parceiros" : "/parceiro-trilha"}/${parceiro.id}/editar`}
                    className="text-sm font-semibold text-foreground underline-offset-4 hover:underline hover:text-foreground"
                  >
                    Abrir ficha do parceiro
                  </Link>
                </p>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Venda direta da Trilha, sem corretor. A comissão fica com a Trilha.</p>
            )}
          </Bloco>

          {data.observacao ? (
            <Bloco titulo="Observação do corretor">
              <p className="text-sm whitespace-pre-line text-foreground">{data.observacao}</p>
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
                  className="text-sm font-semibold text-foreground underline-offset-4 hover:underline hover:text-foreground"
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
    <section className="rounded-xl border bg-card p-6 shadow-xs">
      <h2 className="mb-4 text-sm font-semibold text-muted-foreground">
        {titulo}
      </h2>
      {children}
    </section>
  );
}

function Dado({ termo, valor }: { termo: string; valor: string }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{termo}</dt>
      <dd className="text-sm text-foreground">{valor}</dd>
    </div>
  );
}
