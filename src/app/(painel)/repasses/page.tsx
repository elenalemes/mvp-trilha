import Link from "next/link";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { ehAdmin, getSessao } from "@/lib/sessao";
import { formatBRL } from "@/lib/br";
import { rotuloParcela } from "@/lib/jornada";
import { EmptyState, PageHeader } from "@/components/ui";
import { AcoesLote, GerarRepassesAgora } from "@/components/acoes-repasse";

/**
 * Repasses — o dinheiro que sai para vendedores e corretores. Só a Trilha.
 *
 * Quatro abas, na ordem em que o dinheiro anda:
 *   Prontos       parcelas pagas esperando a janela (dia 14), por pessoa
 *   Aguardando    Pix pedido ao Asaas, esperando a aprovação por SMS
 *   Com problema  falhou (corrigir e tentar de novo) ou verificar (conferir
 *                 no Asaas antes de qualquer coisa)
 *   Concluídos    o Asaas confirmou que saiu
 *
 * Lida pela chave de servidor depois de conferir que é admin: os nomes vêm do
 * cadastro da incorporadora, que tem colunas protegidas para a sessão.
 */
export const dynamic = "force-dynamic";

const ABAS = [
  { id: "prontos", rotulo: "Prontos" },
  { id: "aguardando", rotulo: "Aguardando aprovação" },
  { id: "problema", rotulo: "Com problema" },
  { id: "concluidos", rotulo: "Concluídos" },
] as const;

type Aba = (typeof ABAS)[number]["id"];

type LinhaRepasse = {
  valor: number;
  beneficiario: "vendedor" | "corretor";
  parcela: { numero: number } | null;
  negocio: { imovel: { identificacao: string } | null } | null;
};

type Lote = {
  id: string;
  data_ref: string;
  beneficiario: "vendedor" | "corretor";
  valor: number;
  status: string;
  nome_beneficiario: string | null;
  chave_pix: string | null;
  erro: string | null;
  tentativas: number;
  enviado_em: string | null;
  concluido_em: string | null;
  asaas_transferencia_id: string | null;
  incorporadora: { nome: string } | null;
  parceiro: { nome: string } | null;
  repasse: LinhaRepasse[];
};

type Pronto = {
  id: string;
  valor: number;
  beneficiario: "vendedor" | "corretor";
  parceiro: { nome: string } | null;
  parcela: { numero: number } | null;
  negocio: { incorporadora: { nome: string } | null; imovel: { identificacao: string } | null } | null;
};

const STATUS_DA_ABA: Record<Exclude<Aba, "prontos">, string[]> = {
  aguardando: ["preparado", "enviado"],
  problema: ["falhou", "verificar", "enviando"],
  concluidos: ["concluido"],
};

const dataHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "—";

const quemDoLote = (l: Lote) => l.nome_beneficiario ?? l.parceiro?.nome ?? l.incorporadora?.nome ?? "—";

const composicao = (linhas: LinhaRepasse[]) =>
  linhas
    .map((r) => `${r.negocio?.imovel?.identificacao ?? "unidade"} · ${r.parcela ? rotuloParcela(r.parcela.numero) : "parcela ?"} (${formatBRL(r.valor)})`)
    .join(" · ");

export default async function RepassesPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const sessao = await getSessao();
  if (!ehAdmin(sessao)) redirect("/");

  const { aba: abaPedida } = await searchParams;
  const aba: Aba = ABAS.some((a) => a.id === abaPedida) ? (abaPedida as Aba) : "prontos";

  const admin = createAdminClient();

  const [{ data: prontosData }, { data: contagem }, { data: cfg }] = await Promise.all([
    admin
      .from("repasse")
      .select("id, valor, beneficiario, parceiro (nome), parcela (numero), negocio (incorporadora (nome), imovel (identificacao))")
      .eq("status", "pronto")
      .is("lote_id", null)
      .returns<Pronto[]>(),
    admin.from("repasse_lote").select("status").in("status", ["falhou", "verificar", "enviando", "preparado", "enviado"]),
    admin
      .from("config_financeiro")
      .select("repasse_ligado, asaas_ambiente, dia_repasse_inicio, dia_repasse_fim")
      .maybeSingle<{ repasse_ligado: boolean; asaas_ambiente: string; dia_repasse_inicio: number; dia_repasse_fim: number }>(),
  ]);

  const prontos = prontosData ?? [];
  const conta = (sts: string[]) => (contagem ?? []).filter((c) => sts.includes(c.status)).length;
  const badge: Record<Aba, number> = {
    prontos: prontos.length,
    aguardando: conta(STATUS_DA_ABA.aguardando),
    problema: conta(STATUS_DA_ABA.problema),
    concluidos: 0,
  };

  let lotes: Lote[] = [];
  if (aba !== "prontos") {
    const { data } = await admin
      .from("repasse_lote")
      .select(
        `id, data_ref, beneficiario, valor, status, nome_beneficiario, chave_pix, erro, tentativas,
         enviado_em, concluido_em, asaas_transferencia_id,
         incorporadora (nome), parceiro (nome),
         repasse (valor, beneficiario, parcela (numero), negocio (imovel (identificacao)))`,
      )
      .in("status", STATUS_DA_ABA[aba])
      .order(aba === "concluidos" ? "concluido_em" : "created_at", { ascending: false })
      .limit(aba === "concluidos" ? 60 : 200)
      .returns<Lote[]>();
    lotes = data ?? [];
  }

  // Prontos agrupados por pessoa — é assim que vão virar Pix no dia 14.
  const grupos = new Map<string, { quem: string; papel: string; total: number; itens: Pronto[] }>();
  for (const r of prontos) {
    const quem = r.beneficiario === "corretor" ? (r.parceiro?.nome ?? "corretor") : (r.negocio?.incorporadora?.nome ?? "vendedor");
    const chave = `${r.beneficiario}:${quem}`;
    const g = grupos.get(chave) ?? { quem, papel: r.beneficiario === "corretor" ? "Corretor" : "Vendedor", total: 0, itens: [] };
    g.total += Number(r.valor);
    g.itens.push(r);
    grupos.set(chave, g);
  }

  return (
    <>
      <PageHeader
        titulo="Repasses"
        descricao={`Pix para vendedores e corretores, nos dias ${cfg?.dia_repasse_inicio ?? 14} e ${cfg?.dia_repasse_fim ?? 15}. Cada um só sai depois da aprovação por SMS no Asaas.`}
      />

      {!cfg?.repasse_ligado ? (
        <p className="mb-4 rounded-lg border border-aviso/30 bg-aviso-suave px-4 py-3 text-sm text-aviso">
          Os repasses estão <strong>desligados</strong> na configuração do financeiro: nada é enviado ao Asaas, nem no dia 14
          nem pelo botão.
        </p>
      ) : cfg.asaas_ambiente === "sandbox" ? (
        <p className="mb-4 rounded-lg border bg-muted px-4 py-3 text-sm text-muted-foreground">
          Modo de teste: os Pix vão para o <strong>sandbox</strong> do Asaas, sem dinheiro real.
        </p>
      ) : null}

      <nav className="mb-5 flex flex-wrap gap-1 border-b">
        {ABAS.map((a) => (
          <Link
            key={a.id}
            href={`/repasses?aba=${a.id}`}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${
              aba === a.id ? "border-foreground font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {a.rotulo}
            {badge[a.id] ? (
              <span
                className={`ml-1.5 rounded-full px-1.5 text-xs ${a.id === "problema" ? "bg-erro-suave text-destructive" : "bg-muted"}`}
              >
                {badge[a.id]}
              </span>
            ) : null}
          </Link>
        ))}
      </nav>

      {aba === "prontos" ? (
        <>
          <div className="mb-4 flex justify-end">
            <GerarRepassesAgora quantos={grupos.size} />
          </div>
          {grupos.size === 0 ? (
            <EmptyState titulo="Nenhum repasse pronto" texto="Quando uma parcela é paga, a parte de cada um aparece aqui até o dia do repasse." />
          ) : (
            <Tabela
              cabecalho={["Para", "Papel", "Valor do Pix", "Composição"]}
              linhas={[...grupos.values()].map((g) => [
                <span key="q" className="font-medium">{g.quem}</span>,
                g.papel,
                <span key="v" className="tabular-nums">{formatBRL(g.total)}</span>,
                <span key="c" className="text-muted-foreground">
                  {g.itens.map((r) => `${r.negocio?.imovel?.identificacao ?? "unidade"} · ${r.parcela ? rotuloParcela(r.parcela.numero) : "parcela ?"}`).join(" · ")}
                </span>,
              ])}
            />
          )}
        </>
      ) : lotes.length === 0 ? (
        <EmptyState
          titulo={aba === "problema" ? "Nenhum repasse com problema" : aba === "aguardando" ? "Nada aguardando aprovação" : "Nenhum repasse concluído ainda"}
          texto="Quando houver, aparece aqui."
        />
      ) : (
        <Tabela
          cabecalho={
            aba === "problema"
              ? ["Para", "Valor", "O que houve", "O que fazer"]
              : aba === "aguardando"
                ? ["Para", "Valor", "Chave Pix", "Enviado em", "Composição"]
                : ["Para", "Valor", "Chave Pix", "Concluído em", "Composição"]
          }
          linhas={lotes.map((l) =>
            aba === "problema"
              ? [
                  <span key="q" className="font-medium">{quemDoLote(l)}</span>,
                  <span key="v" className="tabular-nums">{formatBRL(l.valor)}</span>,
                  <span key="e" className="text-destructive">
                    {l.status === "falhou" ? "" : <strong>Verificar no Asaas. </strong>}
                    {l.erro ?? "—"}
                    <span className="block text-xs text-muted-foreground">
                      {l.tentativas} tentativa(s) · {composicao(l.repasse)}
                    </span>
                  </span>,
                  <AcoesLote key="a" loteId={l.id} status={l.status === "falhou" ? "falhou" : "verificar"} />,
                ]
              : [
                  <span key="q" className="font-medium">{quemDoLote(l)}</span>,
                  <span key="v" className="tabular-nums">{formatBRL(l.valor)}</span>,
                  <span key="k" className="text-muted-foreground">{l.chave_pix ?? (l.status === "preparado" ? "enviando…" : "—")}</span>,
                  dataHora(aba === "concluidos" ? l.concluido_em : l.enviado_em),
                  <span key="c" className="text-muted-foreground">{composicao(l.repasse)}</span>,
                ],
          )}
        />
      )}
    </>
  );
}

function Tabela({ cabecalho, linhas }: { cabecalho: string[]; linhas: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
      <table className="w-full min-w-[720px] border-collapse text-left">
        <thead>
          <tr className="border-b">
            {cabecalho.map((h) => (
              <th key={h} className="bg-muted/50 px-4 py-2.5 text-xs font-medium whitespace-nowrap text-muted-foreground">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((celulas, i) => (
            <tr key={i} className="border-b align-top last:border-0">
              {celulas.map((c, j) => (
                <td key={j} className="px-4 py-3 text-sm">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
