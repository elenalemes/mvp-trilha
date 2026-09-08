import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ehParceiro, getSessao, podeEditar } from "@/lib/sessao";
import { formatArea, formatBRL, imovelStatusLabel, imovelTipoLabel } from "@/lib/br";
import { PRAZO_PADRAO_MESES } from "@/lib/trilha";
import { calcularCondicoes } from "@/lib/pagamento";
import { opcoesQueValem } from "@/lib/opcoes";
import { PageHeader, StatusPill } from "@/components/ui";
import CardPagamento from "@/components/card-pagamento";

type Registro = {
  id: string;
  empreendimento_id: string;
  identificacao: string;
  tipologia: string | null;
  observacao: string | null;
  numero_matricula: string | null;
  tipo: string;
  status: string;
  valor: number | null;
  valor_reajustado: number | null;
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
  empreendimento: {
    nome: string;
    incorporadora_id: string;
    incorporadora: { nome: string; percentual_comissao: number } | null;
  } | null;
};

function Item({ label, valor }: { label: string; valor: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-display text-xs font-semibold tracking-[0.12em] text-trilha-400 uppercase">
        {label}
      </span>
      <span className="text-[15px] text-trilha-900">{valor}</span>
    </div>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-trilha-200 bg-white p-6">
      <h2 className="font-display mb-5 border-b border-trilha-100 pb-3 text-xl font-semibold text-trilha-700">
        {titulo}
      </h2>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">{children}</div>
    </section>
  );
}

/** Falta alguma coisa para os cards existirem — diz o quê, e o que fazer. */
function Pendencia({ titulo, texto, acao }: { titulo: string; texto: string; acao?: { href: string; label: string } }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-4">
      <p className="font-display text-[15px] font-semibold text-amber-900">{titulo}</p>
      <p className="mt-1 text-sm text-amber-800">{texto}</p>
      {acao ? (
        <Link
          href={acao.href}
          className="font-display mt-3 inline-block rounded-md border border-amber-300 bg-white px-3.5 py-1.5 text-sm font-semibold tracking-wide text-amber-900 transition-colors hover:bg-amber-100"
        >
          {acao.label}
        </Link>
      ) : null}
    </div>
  );
}

export default async function ImovelPage({
  params,
}: {
  params: Promise<{ id: string; imovelId: string }>;
}) {
  const { id, imovelId } = await params;
  const sessao = await getSessao();
  const admin = sessao?.conta?.tipo === "trilha_admin";
  const edita = podeEditar(sessao);
  const parceiro = ehParceiro(sessao);

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("imovel")
    .select(
      `id, empreendimento_id, identificacao, tipologia, observacao, numero_matricula,
       tipo, status, valor, valor_reajustado, metros_quadrados, area_total, area_garden,
       posicao_solar, num_quartos, num_suites, num_banheiros, num_vagas, matricula_vaga,
       sacada, churrasqueira,
       empreendimento (nome, incorporadora_id, incorporadora (nome, percentual_comissao))`,
    )
    .eq("id", imovelId)
    .eq("empreendimento_id", id)
    .maybeSingle<Registro>();

  // "Não existe" e "não consigo ler" são coisas diferentes.
  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-4">
        <p className="font-display text-[15px] font-semibold text-red-800">
          O banco recusou a leitura deste imóvel.
        </p>
        <p className="mt-1 text-sm text-red-700">
          {error.code ?? "sem código"}: {error.message ?? "sem mensagem"}
        </p>
      </div>
    );
  }
  if (!data) notFound();

  const incorporadoraId = data.empreendimento?.incorporadora_id;

  const { opcoes, origem } = incorporadoraId
    ? await opcoesQueValem(supabase, incorporadoraId, id)
    : { opcoes: [], origem: "nenhuma" as const };

  const comissao = data.empreendimento?.incorporadora?.percentual_comissao ?? 0;
  const condicoes = calcularCondicoes(data.valor, opcoes, comissao);
  const semOpcoes = opcoes.length === 0;

  const caracteristicas = [
    data.num_quartos ? `${data.num_quartos} dorm.` : null,
    data.num_suites ? `${data.num_suites} suíte(s)` : null,
    data.num_banheiros ? `${data.num_banheiros} banh.` : null,
    data.num_vagas ? `${data.num_vagas} vaga(s)` : null,
    data.sacada ? "sacada" : null,
    data.churrasqueira ? "churrasqueira" : null,
  ].filter(Boolean);

  return (
    <>
      <PageHeader
        titulo={data.identificacao}
        descricao={[data.empreendimento?.nome, data.empreendimento?.incorporadora?.nome]
          .filter(Boolean)
          .join(" · ")}
        voltar={{ href: `/empreendimentos/${id}`, label: data.empreendimento?.nome ?? "Voltar" }}
        acao={
          edita
            ? { href: `/empreendimentos/${id}/imoveis/${imovelId}/editar`, label: "Editar imóvel" }
            : undefined
        }
      />

      <div className="flex flex-col gap-6">
        <Bloco titulo="A unidade">
          <Item label="Tipo" valor={imovelTipoLabel(data.tipo)} />
          <Item label="Tipologia" valor={data.tipologia || "—"} />
          <Item
            label="Situação"
            valor={<StatusPill status={data.status} label={imovelStatusLabel(data.status)} />}
          />
          <Item label="Valor inicial" valor={formatBRL(data.valor)} />
          <Item
            label={`Valor reajustado (${PRAZO_PADRAO_MESES} meses)`}
            valor={formatBRL(data.valor_reajustado)}
          />
          <Item label="Área privativa" valor={formatArea(data.metros_quadrados)} />
          <Item label="Área total" valor={formatArea(data.area_total)} />
          <Item label="Área de garden" valor={formatArea(data.area_garden)} />
          <Item label="Posição solar" valor={data.posicao_solar || "—"} />
          <Item label="Nº da matrícula" valor={data.numero_matricula || "—"} />
          <Item label="Matrícula da vaga" valor={data.matricula_vaga || "—"} />
          <div className="col-span-2 sm:col-span-4">
            <Item
              label="Características"
              valor={caracteristicas.length ? caracteristicas.join(" · ") : "—"}
            />
          </div>
          {data.observacao ? (
            <div className="col-span-2 sm:col-span-4">
              <Item label="Observação" valor={data.observacao} />
            </div>
          ) : null}
        </Bloco>

        <section>
          <div className="mb-4">
            <h2 className="font-display text-xl font-semibold text-trilha-700">
              Opções de pagamento para este imóvel
            </h2>
            {condicoes.length ? (
              <p className="mt-0.5 text-sm text-trilha-400">
                {origem === "empreendimento"
                  ? "Condições próprias deste empreendimento."
                  : `Padrão de ${data.empreendimento?.incorporadora?.nome ?? "a incorporadora"}.`}
              </p>
            ) : null}
          </div>

          {semOpcoes ? (
            <Pendencia
              titulo="Cadastre as opções de pagamento"
              texto={
                parceiro
                  ? "Esta incorporadora ainda não definiu os formatos de pagamento. Fale com ela antes de oferecer esta unidade."
                  : "Esta incorporadora ainda não tem formatos de pagamento definidos, então nenhum imóvel dela mostra condições. O cadastro de unidades segue normal."
              }
              acao={!edita ? undefined : {
                // A Trilha edita pela ficha da incorporadora; ela, pelo perfil.
                href:
                  admin && incorporadoraId
                    ? `/incorporadoras/${incorporadoraId}/opcoes-pagamento`
                    : "/opcoes-pagamento/padrao",
                label: "Definir opções de pagamento",
              }}
            />
          ) : condicoes.length === 0 ? (
            <Pendencia
              titulo="Informe o valor do imóvel"
              texto="As opções de pagamento existem, mas viram números a partir do preço da unidade. Sem valor cadastrado não há o que calcular."
              acao={
                edita
                  ? {
                      href: `/empreendimentos/${id}/imoveis/${imovelId}/editar`,
                      label: "Informar o valor",
                    }
                  : undefined
              }
            />
          ) : (
            /* Lado a lado, todos com a mesma largura: nenhuma opção parece
               ser "a principal". Quando não cabem, a faixa rola para o lado
               em vez de empilhar e criar hierarquia visual. */
            <div className="-mx-1 snap-x snap-mandatory overflow-x-auto px-1 pb-3">
              <div
                className="grid gap-4"
                style={{
                  gridTemplateColumns: `repeat(${condicoes.length}, minmax(23rem, 1fr))`,
                }}
              >
                {condicoes.map((c) => (
                  <CardPagamento key={c.ordem} condicao={c} modo={parceiro ? "parceiro" : "completo"} />
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
