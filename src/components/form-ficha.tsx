"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, type Path, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { fichaSchema, type FichaValues } from "@/lib/schemas";
import { MARITAL_STATUSES, REGIMES_BENS, maskCPF, maskPhone, telefoneNacional, temConjuge } from "@/lib/br";
import { salvarFicha } from "@/app/actions/ficha";
import { Alert, Button, Field, Input, Section, Select } from "@/components/ui";

const mascaraTelefone = (v: string) => maskPhone(telefoneNacional(v));

/**
 * Os dados do comprador, abertos dentro da própria tarefa do fechamento.
 *
 * O bloco do cônjuge e o regime de bens só aparecem para "casado" e "união
 * estável". Escondidos, os campos continuam no formulário — trocar de
 * "casado" para "solteiro" e voltar não apaga o que foi digitado. Quem limpa
 * na hora de gravar é a action.
 */
export default function FormFicha({
  negocioId,
  inicial,
  somenteLeitura,
  aoFechar,
}: {
  negocioId: string;
  inicial: FichaValues;
  somenteLeitura: boolean;
  /** Recolhe o formulário: depois de salvar, ou no "Cancelar". */
  aoFechar: () => void;
}) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const {
    register,
    handleSubmit,
    control,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<FichaValues>({
    resolver: zodResolver(fichaSchema) as unknown as Resolver<FichaValues>,
    mode: "onBlur",
    defaultValues: inicial,
  });

  const estadoCivil = useWatch({ control, name: "comprador.estado_civil" });
  const casado = temConjuge(estadoCivil);

  const comMascara = (nome: Path<FichaValues>, mascara: (v: string) => string) => {
    const campo = register(nome);
    return {
      ...campo,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        e.target.value = mascara(e.target.value);
        return campo.onChange(e);
      },
    };
  };

  const enviar = (valores: FichaValues) => {
    setErro(null);
    iniciar(async () => {
      const r = await salvarFicha(negocioId, valores);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      router.refresh();
      aoFechar();
    });
  };

  const c = errors.comprador;
  const j = errors.conjuge;

  return (
    <form onSubmit={handleSubmit(enviar)} className="flex flex-col gap-6" noValidate>
      <fieldset disabled={somenteLeitura || pendente} className="flex flex-col gap-6">
        <Section title="Comprador">
          <Field label="Nome completo" error={c?.nome?.message} span={6}>
            <Input aria-invalid={!!c?.nome} {...register("comprador.nome")} />
          </Field>
          <Field label="E-mail" error={c?.email?.message} span={3}>
            <Input type="email" aria-invalid={!!c?.email} {...register("comprador.email")} />
          </Field>
          <Field label="Telefone" error={c?.telefone?.message} span={3}>
            <Input
              inputMode="tel"
              placeholder="(53) 99999-0000"
              aria-invalid={!!c?.telefone}
              {...comMascara("comprador.telefone", mascaraTelefone)}
            />
          </Field>
          <Field label="CPF" error={c?.cpf?.message} span={2}>
            <Input
              inputMode="numeric"
              placeholder="000.000.000-00"
              aria-invalid={!!c?.cpf}
              {...comMascara("comprador.cpf", maskCPF)}
            />
          </Field>
          <Field label="RG" error={c?.rg?.message} span={2}>
            <Input aria-invalid={!!c?.rg} {...register("comprador.rg")} />
          </Field>
          <Field label="Órgão emissor" error={c?.rg_emissor?.message} span={2}>
            <Input placeholder="SSP/RS" aria-invalid={!!c?.rg_emissor} {...register("comprador.rg_emissor")} />
          </Field>
          <Field label="Endereço" error={c?.endereco?.message} span={6}>
            <Input
              placeholder="Rua, número, complemento, bairro, cidade"
              aria-invalid={!!c?.endereco}
              {...register("comprador.endereco")}
            />
          </Field>
          <Field label="Profissão" error={c?.profissao?.message} span={3}>
            <Input aria-invalid={!!c?.profissao} {...register("comprador.profissao")} />
          </Field>
          <Field label="Estado civil" error={c?.estado_civil?.message} span={3}>
            <Select aria-invalid={!!c?.estado_civil} {...register("comprador.estado_civil")}>
              <option value="">Selecione</option>
              {MARITAL_STATUSES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
          {casado ? (
            <Field label="Regime de bens" error={c?.regime_bens?.message} span={6}>
              <Select aria-invalid={!!c?.regime_bens} {...register("comprador.regime_bens")}>
                <option value="">Selecione</option>
                {REGIMES_BENS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
        </Section>

        {casado ? (
          <Section title="Cônjuge">
            <Field label="Nome completo" error={j?.nome?.message} span={6}>
              <Input aria-invalid={!!j?.nome} {...register("conjuge.nome")} />
            </Field>
            <Field label="E-mail" error={j?.email?.message} span={3}>
              <Input type="email" aria-invalid={!!j?.email} {...register("conjuge.email")} />
            </Field>
            <Field label="Telefone" error={j?.telefone?.message} span={3}>
              <Input
                inputMode="tel"
                placeholder="(53) 99999-0000"
                aria-invalid={!!j?.telefone}
                {...comMascara("conjuge.telefone", mascaraTelefone)}
              />
            </Field>
            <Field label="CPF" error={j?.cpf?.message} span={2}>
              <Input
                inputMode="numeric"
                placeholder="000.000.000-00"
                aria-invalid={!!j?.cpf}
                {...comMascara("conjuge.cpf", maskCPF)}
              />
            </Field>
            <Field label="RG" error={j?.rg?.message} span={2}>
              <Input aria-invalid={!!j?.rg} {...register("conjuge.rg")} />
            </Field>
            <Field label="Órgão emissor" error={j?.rg_emissor?.message} span={2}>
              <Input placeholder="SSP/RS" aria-invalid={!!j?.rg_emissor} {...register("conjuge.rg_emissor")} />
            </Field>
            <Field label="Endereço" error={j?.endereco?.message} span={6}>
              <Input aria-invalid={!!j?.endereco} {...register("conjuge.endereco")} />
              {!somenteLeitura ? (
                <button
                  type="button"
                  onClick={() =>
                    setValue("conjuge.endereco", getValues("comprador.endereco"), { shouldValidate: true })
                  }
                  className="self-start text-sm text-foreground underline-offset-4 hover:underline hover:text-foreground"
                >
                  Mesmo endereço do comprador
                </button>
              ) : null}
            </Field>
            <Field label="Profissão" error={j?.profissao?.message} span={3}>
              <Input aria-invalid={!!j?.profissao} {...register("conjuge.profissao")} />
            </Field>
          </Section>
        ) : null}
      </fieldset>

      {erro ? <Alert>{erro}</Alert> : null}

      <div className="flex flex-wrap gap-3">
        {!somenteLeitura ? (
          <Button type="submit" disabled={pendente}>
            {pendente ? "Salvando…" : "Salvar dados"}
          </Button>
        ) : null}
        <Button type="button" variant="ghost" onClick={aoFechar} disabled={pendente}>
          {somenteLeitura ? "Fechar" : "Cancelar"}
        </Button>
      </div>
    </form>
  );
}
