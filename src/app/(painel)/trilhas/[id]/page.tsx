import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ehAdmin, ehParceiro, getSessao } from "@/lib/sessao";
import { formatBRL } from "@/lib/br";
import {
  dataBR,
  horaDeFinanciar,
  jornada,
  quitacao,
  resumoParcelas,
  rotuloJornada,
  type Parcela,
} from "@/lib/jornada";
import { PageHeader, Stat } from "@/components/ui";
import ErroLeitura from "@/components/erro-leitura";
import ParcelasTrilha from "@/components/parcelas-trilha";
import CobrancaTrilha from "@/components/cobranca-trilha";

/**
 * O painel de uma trilha.
 *
 * Aqui se acompanha o COMPRADOR na jornada de pagamento dele — é outro assunto
 * que o fechamento, e por isso é outra tela. A ficha do negócio continua sendo
 * a do checklist e dos documentos; esta responde três perguntas: em que mês
 * estamos, o que já entrou, e o que falta.
 *
 * A manchete é a mesma escolha do fechamento, de cabeça trocada: lá é de quem é
 * a bola, aqui é quantas parcelas estão em atraso. Percentual de jornada não
 * faz ninguém se mexer — "2 em atraso" faz.
 *
 * O recorte por ator não é feito aqui: a incorporadora não tem policy em
 * `comprador`, então o embed volta nulo e o bloco simplesmente não aparece.
 * Marcar parcela é só da Trilha, e quem recusa é a policy, não este arquivo.
 */
export const dynamic = "force-dynamic";

type Ficha = {
  id: string;
  status: string;
  jornada_inicio: string | null;
  token: string;
  cobranca_automatica: boolean;
  primeiro_vencimento: string | null;
  parceiro_id: string | null;
  proposta: {
    id: string;
    codigo: string;
    prazo_meses: number;
    percentual_entrada: number;
    percentual_ato: number;
    valor_base: number;
    valor_entrada: number;
    valor_ato: number;
    valor_parcela: number;
    valor_saldo: number;
    condicao_especial: boolean;
  } | null;
  imovel: {
    identificacao: string;
    numero_matricula: string | null;
    tipologia: string | null;
    metros_quadrados: number | null;
    num_quartos: number | null;
    num_vagas: number | null;
  } | null;
  empreendimento: { nome: string; endereco: string | null } | null;
  incorporadora: { nome: string; tipo: string; resp_nome: string | null } | null;
  parceiro: { nome: string; telefone: string | null; incorporadora_id: string | null } | null;
  comprador: { nome: string; cpf: string; email: string; telefone: string } | null;
};

export default async function TrilhaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const sessao = await getSessao();
  const admin = ehAdmin(sessao);
  const corretor = ehParceiro(sessao);

  const supabase = await createClient();

  const { data: negocio, error } = await supabase
    .from("negocio")
    .select(
      `id, status, jornada_inicio, token, parceiro_id, cobranca_automatica, primeiro_vencimento,
       proposta (id, codigo, prazo_meses, percentual_entrada, percentual_ato,
                 valor_base, valor_entrada, valor_ato, valor_parcela, valor_saldo, condicao_especial),
       imovel (identificacao, numero_matricula, tipologia, metros_quadrados, num_quartos, num_vagas),
       empreendimento (nome, endereco),
       incorporadora (nome, tipo, resp_nome),
       parceiro (nome, telefone, incorporadora_id),
       comprador (nome, cpf, email, telefone)`,
    )
    .eq("id", id)
    .maybeSingle<Ficha>();

  if (error) return <ErroLeitura oQue="da trilha" erro={error} />;
  if (!negocio) notFound();

  const { data: linhas, error: erroParcelas } = await supabase
    .from("parcela")
    // Os campos do Asaas só vão para a Trilha: os outros não têm o que fazer
    // com o link da fatura do comprador.
    .select(
      admin
        ? "id, numero, vencimento, valor, status, pago_em, asaas_cobranca_id, asaas_link, cobranca_erro"
        : "id, numero, vencimento, valor, status, pago_em",
    )
    .eq("negocio_id", id)
    .order("numero")
    .returns<Parcela[]>();

  if (erroParcelas) return <ErroLeitura oQue="das parcelas" erro={erroParcelas} />;

  const parcelas = linhas ?? [];

  // O ambiente do Asaas (teste ou real) aparece no quadro de cobrança — só a
  // Trilha lê a configuração, e só ela vê o quadro.
  let ambiente: "sandbox" | "producao" | null = null;
  if (admin) {
    const { data: cfg } = await supabase
      .from("config_financeiro")
      .select("asaas_ambiente")
      .maybeSingle<{ asaas_ambiente: "sandbox" | "producao" }>();
    ambiente = cfg?.asaas_ambiente ?? null;
  }
  const datasTravadas = parcelas.some((x) => x.status === "paga" || Boolean(x.asaas_cobranca_id));
  const resumo = resumoParcelas(parcelas);
  const p = negocio.proposta;
  const j = negocio.jornada_inicio && p ? jornada(negocio.jornada_inicio, p.prazo_meses) : null;
  const pf = negocio.incorporadora?.tipo === "proprietario_pf";

  const unidade = negocio.imovel?.identificacao ?? "—";

  return (
    <>
      <PageHeader
        titulo={unidade}
        voltar={{ href: "/trilhas", label: "Trilhas" }}
        descricao={`${negocio.empreendimento?.nome ?? "—"}${p ? ` · proposta ${p.codigo}` : ""}`}
        acao={{ href: `/negocios/${negocio.id}`, label: "Ver o fechamento" }}
      />

      {/* O aviso que existe por causa do risco central do modelo: não é a
          inadimplência das 24 parcelas, é chegar no 25º mês sem financiamento. */}
      {j && horaDeFinanciar(j) && negocio.status !== "quitado" ? (
        <div className="mb-6 rounded-xl border border-aviso/30 bg-aviso-suave px-5 py-4">
          <p className="text-sm font-semibold text-aviso">Hora de encaminhar o financiamento</p>
          <p className="mt-1 text-sm text-aviso/90">
            Faltam {Math.max(0, j.prazo - j.mes)} {j.prazo - j.mes === 1 ? "mês" : "meses"} para o
            fim da Trilha. O comprador quita {p ? formatBRL(p.valor_saldo) : "o saldo"} em{" "}
            {dataBR(quitacao(j))}, e aprovação de crédito não se resolve em três semanas.
          </p>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-6">
          {/* ------------------------------------------------ a jornada */}
          <section className="rounded-xl border bg-card p-5 shadow-xs">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground">A jornada</h2>
              {j ? (
                <span className="text-sm font-medium text-foreground">{rotuloJornada(j)}</span>
              ) : null}
            </div>

            {j ? (
              <>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-destaque"
                    style={{ width: `${Math.round((j.mes / j.prazo) * 100)}%` }}
                  />
                </div>

                <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                  <Dado termo="Começou em">{dataBR(negocio.jornada_inicio!)}</Dado>
                  <Dado termo="Fim da Trilha">{dataBR(j.fim)}</Dado>
                  <Dado termo="Quitação">{dataBR(quitacao(j))}</Dado>
                </dl>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Esta trilha não tem data de início gravada.
              </p>
            )}
          </section>

          {/* ------------------------------------------- o que já entrou */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat
              valor={`${resumo.pagas}/${resumo.total}`}
              label="Parcelas pagas"
              tom={resumo.pagas === resumo.total && resumo.total > 0 ? "positivo" : "padrao"}
            />
            <Stat
              valor={resumo.atrasadas}
              label={resumo.atrasadas === 1 ? "Parcela em atraso" : "Parcelas em atraso"}
              tom={resumo.atrasadas > 0 ? "atencao" : "padrao"}
            />
            <Stat valor={formatBRL(resumo.recebido)} label="Já recebido" />
          </div>

          {/* -------------------------------------------------- extrato */}
          <section>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground">Parcelas</h2>
              <span className="text-sm text-muted-foreground">
                {resumo.proxima
                  ? `próxima em ${dataBR(`${resumo.proxima.vencimento}T12:00:00`)} · ${formatBRL(resumo.proxima.valor)}`
                  : resumo.total > 0
                    ? "todas pagas"
                    : ""}
              </span>
            </div>

            {parcelas.length === 0 ? (
              <p className="rounded-lg border border-border bg-card px-5 py-6 text-sm text-muted-foreground">
                Nenhuma parcela gerada. Elas nascem junto com a jornada — se esta trilha começou
                antes da migração das parcelas, rode `parcelas-da-trilha.sql`.
              </p>
            ) : (
              <ParcelasTrilha parcelas={parcelas} negocioId={negocio.id} podeMarcar={admin} />
            )}
          </section>
        </div>

        {/* ------------------------------------------------- a lateral */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-20">
          {admin && negocio.status === "em_jornada" ? (
            <CobrancaTrilha
              negocioId={negocio.id}
              ambiente={ambiente}
              liberada={negocio.cobranca_automatica}
              primeiroVencimento={negocio.primeiro_vencimento}
              datasTravadas={datasTravadas}
            />
          ) : null}

          {p ? (
            <section className="rounded-xl border bg-card p-5 shadow-xs">
              <h2 className="mb-2 text-sm font-semibold text-foreground">O combinado</h2>
              <dl className="flex flex-col text-sm">
                <Dado termo="Valor final do imóvel">{formatBRL(p.valor_base)}</Dado>
                <Dado termo={`Entrada (${num(p.percentual_entrada)}%)`}>
                  {formatBRL(p.valor_entrada)}
                </Dado>
                <Dado termo={`Ato (${num(p.percentual_ato)}%)`}>{formatBRL(p.valor_ato)}</Dado>
                <Dado termo="Na Trilha">
                  {p.prazo_meses}× {formatBRL(p.valor_parcela)}
                </Dado>
                <Dado termo="A financiar">{formatBRL(p.valor_saldo)}</Dado>
                {p.condicao_especial ? <Dado termo="Tipo">Condição especial</Dado> : null}
              </dl>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                Números congelados na aceitação da proposta. O ato foi pago no fechamento e o saldo
                é o financiamento do mês seguinte ao fim.
              </p>
            </section>
          ) : null}

          {/* A incorporadora não tem policy em `comprador`: para ela este bloco
              não existe, porque o banco não devolveu a linha. */}
          {negocio.comprador ? (
            <section className="rounded-xl border bg-card p-5 shadow-xs">
              <h2 className="mb-2 text-sm font-semibold text-foreground">Comprador</h2>
              <dl className="flex flex-col text-sm">
                <Dado termo="Nome">{negocio.comprador.nome}</Dado>
                <Dado termo="CPF">{negocio.comprador.cpf}</Dado>
                <Dado termo="Telefone">{negocio.comprador.telefone}</Dado>
                <Dado termo="E-mail">{negocio.comprador.email}</Dado>
              </dl>
            </section>
          ) : null}

          <section className="rounded-xl border bg-card p-5 shadow-xs">
            <h2 className="mb-2 text-sm font-semibold text-foreground">Unidade e partes</h2>
            <dl className="flex flex-col text-sm">
              <Dado termo="Unidade">{unidade}</Dado>
              {negocio.imovel?.tipologia ? (
                <Dado termo="Tipologia">{negocio.imovel.tipologia}</Dado>
              ) : null}
              {negocio.imovel?.metros_quadrados ? (
                <Dado termo="Área">{num(negocio.imovel.metros_quadrados)} m²</Dado>
              ) : null}
              {negocio.imovel?.numero_matricula ? (
                <Dado termo="Matrícula">{negocio.imovel.numero_matricula}</Dado>
              ) : null}
              {negocio.empreendimento?.endereco ? (
                <Dado termo="Endereço">{negocio.empreendimento.endereco}</Dado>
              ) : null}
              <Dado termo={pf ? "Proprietário" : "Incorporadora"}>
                {pf
                  ? (negocio.incorporadora?.resp_nome ?? negocio.incorporadora?.nome ?? "—")
                  : (negocio.incorporadora?.nome ?? "—")}
              </Dado>
              {!corretor ? (
                <Dado termo="Corretor">
                  {negocio.parceiro_id
                    ? `${negocio.parceiro?.nome ?? "—"}${negocio.parceiro && !negocio.parceiro.incorporadora_id ? " · Parceiro Trilha" : ""}`
                    : "Venda direta"}
                </Dado>
              ) : null}
            </dl>

            <div className="mt-4 border-t pt-4">
              <Link
                href={`/negocios/${negocio.id}`}
                className="text-sm text-muted-foreground underline-offset-4 hover:underline hover:text-foreground"
              >
                Documentos e fechamento
              </Link>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}

function Dado({ termo, children }: { termo: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t py-1.5 first:border-t-0">
      <dt className="shrink-0 text-muted-foreground">{termo}</dt>
      <dd className="min-w-0 text-right font-medium text-foreground">{children}</dd>
    </div>
  );
}

/** Percentual e área vêm como numeric do banco: 20.00 vira "20". */
const num = (v: number) => Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
