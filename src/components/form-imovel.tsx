"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { imovelSchema, type ImovelFormValues } from "@/lib/schemas";
import { formatBRL, IMOVEL_STATUS, IMOVEL_TIPOS, parseDecimal, POSICOES_SOLARES } from "@/lib/br";
import { OBSERVACAO_REAJUSTE, valorReajustado } from "@/lib/trilha";
import { atualizarImovel, criarImovel } from "@/app/actions/imoveis";
import { Alert, Button, Checkbox, Field, Input, Section, Select, Textarea } from "@/components/ui";

export const IMOVEL_VAZIO: Omit<ImovelFormValues, "empreendimento_id"> = {
  identificacao: "",
  tipologia: "",
  observacao: "",
  numero_matricula: "",
  tipo: "apartamento",
  status: "disponivel",
  valor: "",
  metros_quadrados: "",
  area_total: "",
  area_garden: "",
  posicao_solar: "",
  num_quartos: "",
  num_suites: "",
  num_banheiros: "",
  num_vagas: "",
  matricula_vaga: "",
  sacada: false,
  churrasqueira: false,
};

/**
 * O imóvel sempre nasce e vive dentro de um empreendimento, então o
 * empreendimento não é um campo escolhível aqui: ele vem do endereço da
 * página. Isso elimina a chance de cadastrar uma unidade no prédio errado.
 */
export default function FormImovel({
  modo,
  id,
  empreendimentoId,
  inicial,
  voltarPara,
}: {
  modo: "criar" | "editar";
  id?: string;
  empreendimentoId: string;
  inicial: ImovelFormValues;
  /** Para onde ir ao cancelar ou concluir. Por padrão, o empreendimento — mas
   *  quem chega pela ficha da unidade espera voltar para ela. */
  voltarPara?: string;
}) {
  const router = useRouter();
  const editando = modo === "editar";
  const [erro, setErro] = useState<string | null>(null);
  const [salvos, setSalvos] = useState<string[]>([]);
  const [pendente, iniciar] = useTransition();

  const destino = voltarPara ?? `/empreendimentos/${empreendimentoId}`;

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<ImovelFormValues>({
    resolver: zodResolver(imovelSchema),
    mode: "onBlur",
    defaultValues: inicial,
  });

  // O valor reajustado não é digitado: acompanha o valor enquanto ela digita.
  const valorDigitado = useWatch({ control, name: "valor" });
  const reajustado = valorReajustado(parseDecimal(valorDigitado ?? ""));

  const salvar = (valores: ImovelFormValues, continuar: boolean) => {
    setErro(null);
    iniciar(async () => {
      const resultado = editando
        ? await atualizarImovel(id!, valores)
        : await criarImovel(valores);

      if (resultado.erro) {
        setErro(resultado.erro);
        return;
      }

      if (continuar) {
        // Limpa os dados da unidade e mantém o empreendimento, para lançar em sequência.
        setSalvos((anteriores) => [valores.identificacao, ...anteriores]);
        reset({ empreendimento_id: empreendimentoId, ...IMOVEL_VAZIO });
        return;
      }

      router.push(destino);
      router.refresh();
    });
  };

  const e = errors;

  return (
    <form className="flex flex-col gap-6" noValidate>
      <input type="hidden" {...register("empreendimento_id")} />

      <Section title="Identificação">
        <Field
          label="Identificação"
          error={e.identificacao?.message}
          span={2}
          hint="Ex.: Apto 302, Casa 14"
        >
          <Input aria-invalid={!!e.identificacao} {...register("identificacao")} />
        </Field>
        <Field
          label="Tipologia"
          span={2}
          optional
          hint='Como a incorporadora chama. Ex.: "Studio", "1D", "2D Garden"'
        >
          <Input {...register("tipologia")} />
        </Field>
        <Field label="Tipo" error={e.tipo?.message} span={2}>
          <Select {...register("tipo")}>
            {IMOVEL_TIPOS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status" error={e.status?.message} span={2}>
          <Select {...register("status")}>
            {IMOVEL_STATUS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Nº da matrícula" span={2} optional>
          <Input {...register("numero_matricula")} />
        </Field>
        <Field label="Matrícula da vaga" span={2} optional>
          <Input {...register("matricula_vaga")} />
        </Field>
      </Section>

      <Section title="Características">
        <Field label="Valor" error={e.valor?.message} span={2} optional hint="Ex.: 600000,00">
          <Input inputMode="decimal" placeholder="0,00" {...register("valor")} />
        </Field>
        <Field label="Valor reajustado" span={2} hint={OBSERVACAO_REAJUSTE}>
          <Input
            readOnly
            tabIndex={-1}
            className="bg-trilha-50 text-trilha-500"
            value={reajustado === null ? "—" : formatBRL(reajustado)}
          />
        </Field>
        <Field label="Área privativa" span={2} optional hint="Em m². Ex.: 92,50">
          <Input inputMode="decimal" placeholder="0,00" {...register("metros_quadrados")} />
        </Field>
        <Field label="Área total" span={2} optional hint="Em m², quando difere da privativa">
          <Input inputMode="decimal" placeholder="0,00" {...register("area_total")} />
        </Field>
        <Field label="Área de garden" span={2} optional hint="Em m², se houver">
          <Input inputMode="decimal" placeholder="0,00" {...register("area_garden")} />
        </Field>

        <Field label="Posição solar" span={2} optional>
          <Select {...register("posicao_solar")}>
            <option value="">Selecione</option>
            {POSICOES_SOLARES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Dormitórios" error={e.num_quartos?.message} span={1} optional>
          <Input inputMode="numeric" {...register("num_quartos")} />
        </Field>
        <Field label="Suítes" error={e.num_suites?.message} span={1} optional>
          <Input inputMode="numeric" {...register("num_suites")} />
        </Field>
        <Field label="Banheiros" error={e.num_banheiros?.message} span={1} optional>
          <Input inputMode="numeric" {...register("num_banheiros")} />
        </Field>
        <Field label="Vagas" error={e.num_vagas?.message} span={1} optional>
          <Input inputMode="numeric" {...register("num_vagas")} />
        </Field>

        <div className="flex flex-wrap gap-x-8 sm:col-span-6">
          <Checkbox label="Sacada" {...register("sacada")} />
          <Checkbox label="Churrasqueira" {...register("churrasqueira")} />
        </div>

        <Field
          label="Observação"
          span={6}
          optional
          hint='O que muda a negociação desta unidade. Ex.: "não aceita dação", "decorado"'
        >
          <Textarea placeholder="Anotações sobre esta unidade" {...register("observacao")} />
        </Field>
      </Section>

      {erro ? <Alert>{erro}</Alert> : null}

      {salvos.length > 0 ? (
        <Alert tone="ok">
          {salvos.length === 1
            ? `${salvos[0]} cadastrado.`
            : `${salvos.length} imóveis cadastrados nesta sessão: ${salvos.join(", ")}.`}
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {editando ? (
          <Button type="button" disabled={pendente} onClick={handleSubmit((v) => salvar(v, false))}>
            {pendente ? "Salvando…" : "Salvar alterações"}
          </Button>
        ) : (
          <>
            <Button type="button" disabled={pendente} onClick={handleSubmit((v) => salvar(v, true))}>
              {pendente ? "Salvando…" : "Salvar e cadastrar outro"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={pendente}
              onClick={handleSubmit((v) => salvar(v, false))}
            >
              Salvar e concluir
            </Button>
          </>
        )}
        <Link
          href={destino}
          className="font-display px-2 text-[15px] font-semibold tracking-wide text-trilha-400 underline underline-offset-2 hover:text-trilha-700"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
