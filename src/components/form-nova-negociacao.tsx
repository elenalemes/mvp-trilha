"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, type Path, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, X } from "lucide-react";
import { propostaLogadaSchema, type PropostaLogadaValues } from "@/lib/schemas";
import { formatBRL, maskCPF, maskPhone, parseDecimal } from "@/lib/br";
import { calcularCondicao, dividirComissao, type Condicao } from "@/lib/pagamento";
import { PRAZO_TRILHA_MAX, PRAZO_TRILHA_MIN } from "@/lib/trilha";
import { cn } from "@/lib/utils";
import { iniciarNegociacao, type CondicaoEspecial } from "@/app/actions/negociacao";
import CardPagamento from "@/components/card-pagamento";
import { Alert, Button, Field, Input, Section, Select, Textarea } from "@/components/ui";

const VENDA_DIRETA = "direta";

/** Percentual digitado: aceita vírgula ou ponto como decimal ("3,6" ou "3.6"). */
const lerPct = (v: string) => {
  const n = Number(v.trim().replace(",", "."));
  return v.trim() !== "" && Number.isFinite(n) ? n : null;
};

type Parceiro = { id: string; nome: string; ativo: boolean; trilha?: boolean };
type LinhaCorretor = { parceiroId: string; pontos: string };

/**
 * A nova negociação: condição, corretor(es) e comprador.
 *
 * Duas formas de condição:
 *   cadastro — uma das opções da incorporadora, clicando no card. Um corretor
 *              ou venda direta.
 *   especial — a Trilha define entrada, ato, prazo, valor do imóvel e
 *              comissão, e pode dividir a comissão entre vários corretores em
 *              pontos do valor final. O que os corretores não levam fica com
 *              a Trilha. O card ao lado recalcula ao vivo, com a mesma conta
 *              do resto do sistema.
 */
export default function FormNovaNegociacao({
  empreendimentoId,
  imovelId,
  condicoes,
  parceiros,
  valorTabela,
  comissaoPadrao,
  proprietarioPF = false,
}: {
  empreendimentoId: string;
  imovelId: string;
  condicoes: Condicao[];
  parceiros: Parceiro[];
  valorTabela: number;
  comissaoPadrao: number;
  /** Imóvel de proprietário PF: os textos falam "proprietário". */
  proprietarioPF?: boolean;
}) {
  const router = useRouter();
  const temCadastro = condicoes.length > 0;
  const [modo, setModo] = useState<"cadastro" | "especial">(temCadastro ? "cadastro" : "especial");

  // ---- condição do cadastro
  const [ordem, setOrdem] = useState(condicoes[0]?.ordem ?? 1);
  const [corretor, setCorretor] = useState("");

  // ---- condição especial (texto, como o resto dos formulários do projeto)
  const base = condicoes[0];
  const [valor, setValor] = useState(valorTabela.toLocaleString("pt-BR", { minimumFractionDigits: 2 }));
  const [entrada, setEntrada] = useState(String(base?.percentualEntrada ?? 20).replace(".", ","));
  const [ato, setAto] = useState(String(base?.percentualAto ?? 0).replace(".", ","));
  const [prazo, setPrazo] = useState(String(base?.prazoMeses ?? 24));
  const [comissao, setComissao] = useState(String(comissaoPadrao).replace(".", ","));
  const [linhas, setLinhas] = useState<LinhaCorretor[]>([]);
  const [principal, setPrincipal] = useState(0);
  const [motivo, setMotivo] = useState("");

  const [erroCorretor, setErroCorretor] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PropostaLogadaValues>({
    resolver: zodResolver(propostaLogadaSchema) as unknown as Resolver<PropostaLogadaValues>,
    mode: "onBlur",
    defaultValues: { comprador: { nome: "", cpf: "", email: "", telefone: "" }, observacao: "" },
  });

  const comMascara = (nome: Path<PropostaLogadaValues>, mascara: (v: string) => string) => {
    const campo = register(nome);
    return {
      ...campo,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        e.target.value = mascara(e.target.value);
        return campo.onChange(e);
      },
    };
  };

  // ---- a condição especial, calculada ao vivo
  const especial = useMemo(() => {
    const v = parseDecimal(valor);
    const e = lerPct(entrada);
    const a = lerPct(ato);
    const p = Number(prazo);
    const c = lerPct(comissao);
    if (v === null || e === null || a === null || c === null || !Number.isInteger(p)) return null;

    const condicao = calcularCondicao(v, { ordem: 0, percentual_entrada: e, percentual_ato: a, prazo_meses: p }, c);
    if (!condicao) return null;

    const fatias = linhas
      .filter((l) => l.parceiroId)
      .map((l) => ({
        parceiroId: l.parceiroId,
        nome: parceiros.find((x) => x.id === l.parceiroId)?.nome ?? "",
        pontos: lerPct(l.pontos) ?? 0,
      }));
    const divisao = fatias.length ? dividirComissao(condicao, fatias) : undefined;

    const problemas: string[] = [];
    if (p < PRAZO_TRILHA_MIN || p > PRAZO_TRILHA_MAX) problemas.push(`O prazo precisa ficar entre ${PRAZO_TRILHA_MIN} e ${PRAZO_TRILHA_MAX} meses.`);
    if (a > e) problemas.push("O ato não pode ser maior que a entrada.");
    if (!condicao.comissaoCabe) problemas.push("A comissão é maior que o que se paga parcelado.");
    if (divisao && !divisao.cabe) problemas.push("As partes dos corretores passam da comissão total.");

    return { condicao, divisao, problemas, valor: v, e, a, p, c };
  }, [valor, entrada, ato, prazo, comissao, linhas, parceiros]);

  const desconto = especial ? valorTabela - especial.valor : 0;

  const enviar = (valores: PropostaLogadaValues) => {
    setErro(null);

    let payload: CondicaoEspecial | undefined;
    if (modo === "cadastro") {
      if (!corretor) {
        setErroCorretor("Escolha o corretor ou marque venda direta.");
        return;
      }
    } else {
      if (!especial) {
        setErro("Preencha valor, entrada, ato, prazo e comissão.");
        return;
      }
      if (especial.problemas.length) {
        setErro(especial.problemas[0]);
        return;
      }
      const escolhidas = linhas.filter((l) => l.parceiroId);
      if (escolhidas.length !== linhas.length) {
        setErro("Escolha o corretor de cada linha da divisão, ou remova a linha.");
        return;
      }
      payload = {
        valorImovel: especial.valor,
        percentualEntrada: especial.e,
        percentualAto: especial.a,
        prazoMeses: especial.p,
        percentualComissao: especial.c,
        corretores: linhas.map((l, i) => ({ parceiroId: l.parceiroId, pontos: lerPct(l.pontos) ?? 0, principal: i === principal })),
        motivo,
      };
    }

    iniciar(async () => {
      const r = await iniciarNegociacao({
        empreendimentoId,
        imovelId,
        ordem,
        parceiroId: modo === "cadastro" && corretor !== VENDA_DIRETA ? corretor : null,
        especial: payload,
        comprador: valores.comprador,
        observacao: valores.observacao,
      });
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      router.push(`/negocios/${r.negocioId}`);
    });
  };

  const c = errors.comprador;
  const vendaDireta = modo === "cadastro" ? corretor === VENDA_DIRETA : linhas.length === 0;
  const usados = new Set(linhas.map((l) => l.parceiroId));

  return (
    <form onSubmit={handleSubmit(enviar)} className="flex flex-col gap-6" noValidate>
      <section className="rounded-xl border bg-card p-6 shadow-xs">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">Condição de pagamento</h2>
            <p className="mt-1 text-sm text-muted-foreground">Os números ficam congelados ao abrir o negócio.</p>
          </div>
          <div role="tablist" className="flex gap-0.5 rounded-lg bg-muted p-0.5">
            {(["cadastro", "especial"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={modo === m}
                disabled={m === "cadastro" && !temCadastro}
                onClick={() => setModo(m)}
                className={cn(
                  "h-8 rounded-md px-3 text-sm font-medium transition-colors disabled:opacity-40",
                  modo === m ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m === "cadastro" ? "Do cadastro" : "Condição especial"}
              </button>
            ))}
          </div>
        </div>

        {modo === "cadastro" ? (
          <div className="-mx-1 overflow-x-auto px-1 pb-2">
            <div
              role="radiogroup"
              aria-label="Condição de pagamento"
              className="grid gap-4"
              style={{ gridTemplateColumns: `repeat(${condicoes.length}, minmax(18rem, 1fr))` }}
            >
              {condicoes.map((cond) => {
                const escolhida = cond.ordem === ordem;
                return (
                  <label
                    key={cond.ordem}
                    className={cn(
                      "relative cursor-pointer rounded-xl transition-shadow",
                      escolhida ? "ring-2 ring-destaque ring-offset-2" : "hover:ring-1 hover:ring-foreground/20",
                    )}
                  >
                    <input type="radio" name="condicao" className="sr-only" checked={escolhida} onChange={() => setOrdem(cond.ordem)} />
                    <CardPagamento condicao={cond} modo="completo" vendaDireta={vendaDireta} proprietarioPF={proprietarioPF} />
                  </label>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-6">
                <Field label="Valor do imóvel" span={3} hint={desconto > 0 ? `Desconto de ${formatBRL(desconto)} sobre o cadastro` : `Cadastro: ${formatBRL(valorTabela)}`}>
                  <Input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
                </Field>
                <Field label="Prazo (meses)" span={3}>
                  <Input inputMode="numeric" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
                </Field>
                <Field label="Entrada (%)" span={2}>
                  <Input inputMode="decimal" value={entrada} onChange={(e) => setEntrada(e.target.value)} />
                </Field>
                <Field label="Ato (%)" span={2}>
                  <Input inputMode="decimal" value={ato} onChange={(e) => setAto(e.target.value)} />
                </Field>
                <Field label="Comissão total (%)" span={2}>
                  <Input inputMode="decimal" value={comissao} onChange={(e) => setComissao(e.target.value)} />
                </Field>
              </div>
              <p className="-mt-2 text-xs text-muted-foreground">Percentuais sobre o valor final do imóvel.</p>

              <div className="flex flex-col gap-3 border-t pt-5">
                <div>
                  <p className="text-sm font-medium text-foreground">Divisão da comissão</p>
                  <p className="text-xs text-muted-foreground">
                    Em pontos do valor final. O que os corretores não levam fica com a Trilha.
                  </p>
                </div>

                {linhas.map((l, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <Select
                      value={l.parceiroId}
                      aria-label="Corretor"
                      onChange={(e) => setLinhas(linhas.map((x, j) => (j === i ? { ...x, parceiroId: e.target.value } : x)))}
                      className="min-w-0 flex-1"
                    >
                      <option value="">Escolha o corretor</option>
                      {parceiros
                        .filter((p) => p.id === l.parceiroId || !usados.has(p.id))
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nome}
                            {p.trilha ? " · Parceiro Trilha" : ""}
                            {p.ativo ? "" : " (inativo)"}
                          </option>
                        ))}
                    </Select>
                    <div className="relative w-24">
                      <Input
                        inputMode="decimal"
                        aria-label="Pontos"
                        value={l.pontos}
                        placeholder="0"
                        onChange={(e) => setLinhas(linhas.map((x, j) => (j === i ? { ...x, pontos: e.target.value } : x)))}
                        className="pr-7"
                      />
                      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                    </div>
                    <label className="flex items-center gap-1.5 text-sm text-foreground">
                      <input type="radio" name="principal" checked={principal === i} onChange={() => setPrincipal(i)} className="accent-primary" />
                      Principal
                    </label>
                    <button
                      type="button"
                      aria-label="Remover corretor"
                      onClick={() => {
                        setLinhas(linhas.filter((_, j) => j !== i));
                        setPrincipal((p) => (p === i ? 0 : p > i ? p - 1 : p));
                      }}
                      className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-erro-suave hover:text-destructive"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ))}

                {linhas.length < parceiros.length ? (
                  <Button type="button" variant="ghost" onClick={() => setLinhas([...linhas, { parceiroId: "", pontos: "" }])} className="w-fit">
                    <Plus aria-hidden="true" />
                    Adicionar corretor
                  </Button>
                ) : null}
                {linhas.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sem corretor: venda direta, toda a comissão fica com a Trilha.</p>
                ) : linhas.length > 1 ? (
                  <p className="text-xs text-muted-foreground">
                    O principal faz as tarefas do corretor e recebe os avisos. Os outros acompanham e veem só a própria parte.
                  </p>
                ) : null}
              </div>

              <Field label="Motivo" span={6} optional>
                <Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={proprietarioPF ? "Ex.: ato reduzido combinado com o proprietário" : "Ex.: ato reduzido combinado com a incorporadora"} />
              </Field>
            </div>

            <div className="flex flex-col gap-3 lg:sticky lg:top-20">
              {especial ? (
                <>
                  <CardPagamento condicao={especial.condicao} modo="completo" divisao={especial.divisao} vendaDireta={vendaDireta} especial proprietarioPF={proprietarioPF} />
                  {especial.problemas.map((p) => (
                    <Alert key={p}>{p}</Alert>
                  ))}
                </>
              ) : (
                <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Preencha os campos para ver a condição.
                </p>
              )}
            </div>
          </div>
        )}
      </section>

      {modo === "cadastro" ? (
        <Section title="Corretor">
          <Field label="Quem vendeu" error={erroCorretor ?? undefined} span={4}>
            <Select
              value={corretor}
              aria-invalid={!!erroCorretor}
              onChange={(e) => {
                setCorretor(e.target.value);
                setErroCorretor(null);
              }}
            >
              <option value="">Selecione</option>
              <option value={VENDA_DIRETA}>Venda direta — sem corretor</option>
              {parceiros.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                  {p.trilha ? " · Parceiro Trilha" : ""}
                  {p.ativo ? "" : " (inativo)"}
                </option>
              ))}
            </Select>
          </Field>
          {vendaDireta ? (
            <p className="text-sm text-muted-foreground sm:col-span-6">
              A comissão fica com a Trilha. As tarefas do corretor passam a ser da Trilha.
            </p>
          ) : null}
        </Section>
      ) : null}

      <Section title="Comprador">
        <Field label="Nome completo" error={c?.nome?.message} span={6}>
          <Input aria-invalid={!!c?.nome} {...register("comprador.nome")} />
        </Field>
        <Field label="CPF" error={c?.cpf?.message} span={2}>
          <Input inputMode="numeric" placeholder="000.000.000-00" aria-invalid={!!c?.cpf} {...comMascara("comprador.cpf", maskCPF)} />
        </Field>
        <Field label="E-mail" error={c?.email?.message} span={2}>
          <Input type="email" aria-invalid={!!c?.email} {...register("comprador.email")} />
        </Field>
        <Field label="Telefone" error={c?.telefone?.message} span={2}>
          <Input inputMode="tel" placeholder="(53) 99999-0000" aria-invalid={!!c?.telefone} {...comMascara("comprador.telefone", maskPhone)} />
        </Field>
        <Field label="Observação" span={6} optional>
          <Textarea rows={2} {...register("observacao")} />
        </Field>
      </Section>

      {erro ? <Alert>{erro}</Alert> : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pendente}>
          {pendente ? "Abrindo…" : "Abrir negócio"}
        </Button>
        <span className="text-sm text-muted-foreground">
          O comprador{vendaDireta ? "" : ", o corretor principal"} e a incorporadora recebem o aviso no WhatsApp.
        </span>
      </div>
    </form>
  );
}
