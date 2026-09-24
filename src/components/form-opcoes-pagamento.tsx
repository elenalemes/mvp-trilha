"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { opcoesPagamentoSchema, type OpcoesPagamentoValues } from "@/lib/schemas";
import { parseDecimal } from "@/lib/br";
import {
  MAX_OPCOES_PAGAMENTO,
  PRAZO_PADRAO_MESES,
  PRAZO_TRILHA_MAX,
  PRAZO_TRILHA_MIN,
} from "@/lib/trilha";
import { salvarOpcoesPagamento } from "@/app/actions/opcoes-pagamento";
import { Alert, Button, Field, Input, Section } from "@/components/ui";

const OPCAO_VAZIA = {
  percentual_entrada: "",
  percentual_ato: "0",
  prazo_meses: String(PRAZO_PADRAO_MESES),
};

const pct = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

function Bloco({
  titulo,
  aoRemover,
  children,
}: {
  titulo: string;
  aoRemover: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card p-6 shadow-xs">
      <header className="mb-5 flex items-center justify-between gap-3 border-b border-border pb-3">
        <h2 className="text-xl font-semibold text-foreground">{titulo}</h2>
        <button
          type="button"
          onClick={aoRemover}
          className="text-sm font-semibold text-muted-foreground transition-colors hover:text-destructive"
        >
          Remover
        </button>
      </header>
      <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-6">{children}</div>
    </section>
  );
}

export default function FormOpcoesPagamento({
  incorporadoraId,
  empreendimentoId,
  iniciais,
  comissaoInicial,
  voltarPara,
}: {
  incorporadoraId: string;
  /** Ausente = está editando o padrão da incorporadora. */
  empreendimentoId?: string;
  iniciais: OpcoesPagamentoValues["opcoes"];
  /** Só no padrão: a comissão é da incorporadora, não de cada opção. */
  comissaoInicial?: string;
  /** A Trilha volta para a ficha da incorporadora; ela volta para o perfil. */
  voltarPara: string;
}) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [pendente, iniciar] = useTransition();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<OpcoesPagamentoValues>({
    resolver: zodResolver(opcoesPagamentoSchema),
    mode: "onBlur",
    defaultValues: { opcoes: iniciais, percentual_comissao: comissaoInicial },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "opcoes" });

  // O que se paga durante a Trilha e o que sobra para financiar são
  // consequência dos dois percentuais — mostramos, não pedimos.
  const atuais = useWatch({ control, name: "opcoes" });

  const enviar = (valores: OpcoesPagamentoValues) => {
    setErro(null);
    setSalvo(false);
    iniciar(async () => {
      const resultado = await salvarOpcoesPagamento(incorporadoraId, valores, empreendimentoId);
      if (resultado.erro) {
        setErro(resultado.erro);
        return;
      }
      setSalvo(true);
      router.refresh();
    });
  };

  const cheio = fields.length >= MAX_OPCOES_PAGAMENTO;

  return (
    <form onSubmit={handleSubmit(enviar)} className="flex flex-col gap-6" noValidate>
      {empreendimentoId ? null : (
        <Section
          title="Comissão do parceiro imobiliário"
          hint="Vale para todas as opções."
        >
          <Field
            label="Comissão"
            error={errors.percentual_comissao?.message}
            span={2}
            hint="% do valor do imóvel reajustado"
          >
            <Input
              inputMode="decimal"
              placeholder="6"
              aria-invalid={!!errors.percentual_comissao}
              {...register("percentual_comissao")}
            />
          </Field>
          <p className="text-sm text-muted-foreground sm:col-span-4">
            Sai da entrada, paga em parcelas durante a Trilha. O saldo do fim não tem desconto.
          </p>
        </Section>
      )}

      {fields.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card px-6 py-10 text-center">
          <p className="text-lg font-semibold text-foreground">
            Nenhuma opção de pagamento
          </p>
          <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">
            {empreendimentoId
              ? "Sem condições próprias, este empreendimento usa o padrão da incorporadora. Salvar assim, vazio, é como voltar a usar o padrão."
              : "Enquanto não houver nenhuma, os imóveis desta incorporadora aparecem sem formatos de pagamento. O cadastro continua liberado."}
          </p>
        </div>
      ) : null}

      {fields.map((campo, i) => {
        const e = errors.opcoes?.[i];
        const entrada = parseDecimal(atuais?.[i]?.percentual_entrada ?? "");
        const ato = parseDecimal(atuais?.[i]?.percentual_ato ?? "") ?? 0;
        const prazo = parseDecimal(atuais?.[i]?.prazo_meses ?? "");
        const fecha =
          entrada !== null && entrada > 0 && entrada <= 100 && ato <= entrada && prazo !== null;

        return (
          <Bloco key={campo.id} titulo={`Opção ${i + 1}`} aoRemover={() => remove(i)}>
            <Field
              label="Entrada total"
              error={e?.percentual_entrada?.message}
              span={2}
              hint="% do valor do imóvel reajustado"
            >
              <Input
                inputMode="decimal"
                placeholder="20"
                aria-invalid={!!e?.percentual_entrada}
                {...register(`opcoes.${i}.percentual_entrada`)}
              />
            </Field>

            <Field
              label="Ato"
              error={e?.percentual_ato?.message}
              span={2}
              hint="Pago no fechamento, sai de dentro da entrada"
            >
              <Input
                inputMode="decimal"
                placeholder="0"
                aria-invalid={!!e?.percentual_ato}
                {...register(`opcoes.${i}.percentual_ato`)}
              />
            </Field>

            <Field
              label="Tempo de Trilha"
              error={e?.prazo_meses?.message}
              span={2}
              hint={`Em meses, de ${PRAZO_TRILHA_MIN} a ${PRAZO_TRILHA_MAX}`}
            >
              <Input
                inputMode="numeric"
                placeholder={String(PRAZO_PADRAO_MESES)}
                aria-invalid={!!e?.prazo_meses}
                {...register(`opcoes.${i}.prazo_meses`)}
              />
            </Field>

            <p className="text-sm text-muted-foreground sm:col-span-6">
              {fecha ? (
                <>
                  Durante a Trilha: <strong className="text-foreground">{pct(ato)}</strong> no ato,{" "}
                  <strong className="text-foreground">{pct(entrada - ato)}</strong> parcelado em{" "}
                  <strong className="text-foreground">{prazo}</strong> meses · A financiar no fim:{" "}
                  <strong className="text-foreground">{pct(100 - entrada)}</strong> do valor.
                </>
              ) : (
                "Preencha a entrada e o prazo para ver como a condição fecha."
              )}
            </p>
          </Bloco>
        );
      })}

      {erro ? <Alert>{erro}</Alert> : null}
      {salvo ? (
        <Alert tone="ok">
          {empreendimentoId
            ? fields.length === 0
              ? "Condições próprias removidas. Este empreendimento voltou a usar o padrão da incorporadora."
              : "Condições salvas. Valem só para os imóveis deste empreendimento."
            : "Padrão salvo. Vale para todos os imóveis da incorporadora que não tenham condições próprias."}
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pendente}>
          {pendente ? "Salvando…" : "Salvar opções"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={cheio}
          onClick={() => append({ ...OPCAO_VAZIA })}
        >
          {cheio ? `Máximo de ${MAX_OPCOES_PAGAMENTO} opções` : "Adicionar opção"}
        </Button>
        <Link
          href={voltarPara}
          className="px-2 text-sm font-semibold text-muted-foreground underline-offset-4 hover:underline hover:text-foreground"
        >
          Voltar
        </Link>
      </div>
    </form>
  );
}
