"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, type Path, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { fichaVendedorSchema, type FichaVendedorValues } from "@/lib/schemas";
import { MARITAL_STATUSES, maskCPF, maskPhone, telefoneNacional, temConjuge } from "@/lib/br";
import { salvarFichaVendedor } from "@/app/actions/ficha-vendedor";
import { Alert, Button, Field, Input, Section, Select } from "@/components/ui";

const mascaraTelefone = (v: string) => maskPhone(telefoneNacional(v));

/**
 * Os dados do vendedor PF, abertos dentro da tarefa "Dados do vendedor".
 * Vêm preenchidos com o cadastro; o bloco do cônjuge só aparece para casado
 * ou união estável.
 */
export default function FormFichaVendedor({
  negocioId,
  inicial,
  somenteLeitura,
  aoFechar,
}: {
  negocioId: string;
  inicial: FichaVendedorValues;
  somenteLeitura: boolean;
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
  } = useForm<FichaVendedorValues>({
    resolver: zodResolver(fichaVendedorSchema) as unknown as Resolver<FichaVendedorValues>,
    mode: "onBlur",
    defaultValues: inicial,
  });

  const casado = temConjuge(useWatch({ control, name: "vendedor.estado_civil" }));

  const comMascara = (nome: Path<FichaVendedorValues>, mascara: (v: string) => string) => {
    const campo = register(nome);
    return {
      ...campo,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        e.target.value = mascara(e.target.value);
        return campo.onChange(e);
      },
    };
  };

  const enviar = (valores: FichaVendedorValues) => {
    setErro(null);
    iniciar(async () => {
      const r = await salvarFichaVendedor(negocioId, valores);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      router.refresh();
      aoFechar();
    });
  };

  const v = errors.vendedor;
  const j = errors.conjuge;

  return (
    <form onSubmit={handleSubmit(enviar)} className="flex flex-col gap-6" noValidate>
      <fieldset disabled={somenteLeitura || pendente} className="flex flex-col gap-6">
        <Section title="Vendedor">
          <Field label="Nome completo" error={v?.nome?.message} span={6}>
            <Input aria-invalid={!!v?.nome} {...register("vendedor.nome")} />
          </Field>
          <Field label="E-mail" error={v?.email?.message} span={3}>
            <Input type="email" aria-invalid={!!v?.email} {...register("vendedor.email")} />
          </Field>
          <Field label="Telefone" error={v?.telefone?.message} span={3}>
            <Input inputMode="tel" aria-invalid={!!v?.telefone} {...comMascara("vendedor.telefone", mascaraTelefone)} />
          </Field>
          <Field label="CPF" error={v?.cpf?.message} span={2}>
            <Input inputMode="numeric" aria-invalid={!!v?.cpf} {...comMascara("vendedor.cpf", maskCPF)} />
          </Field>
          <Field label="RG" span={2} optional>
            <Input {...register("vendedor.rg")} />
          </Field>
          <Field label="Estado civil" error={v?.estado_civil?.message} span={2}>
            <Select aria-invalid={!!v?.estado_civil} {...register("vendedor.estado_civil")}>
              <option value="">Selecione</option>
              {MARITAL_STATUSES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Endereço" span={4} optional>
            <Input placeholder="Rua, número, bairro, cidade" {...register("vendedor.endereco")} />
          </Field>
          <Field label="Profissão" span={2} optional>
            <Input {...register("vendedor.profissao")} />
          </Field>
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
              <Input inputMode="tel" aria-invalid={!!j?.telefone} {...comMascara("conjuge.telefone", mascaraTelefone)} />
            </Field>
            <Field label="CPF" error={j?.cpf?.message} span={2}>
              <Input inputMode="numeric" aria-invalid={!!j?.cpf} {...comMascara("conjuge.cpf", maskCPF)} />
            </Field>
            <Field label="RG" span={2} optional>
              <Input {...register("conjuge.rg")} />
            </Field>
            <Field label="Profissão" span={2} optional>
              <Input {...register("conjuge.profissao")} />
            </Field>
            <Field label="Endereço" span={6} optional>
              <Input {...register("conjuge.endereco")} />
              {!somenteLeitura ? (
                <button
                  type="button"
                  onClick={() => setValue("conjuge.endereco", getValues("vendedor.endereco"))}
                  className="self-start text-sm text-foreground underline-offset-4 hover:underline"
                >
                  Mesmo endereço do vendedor
                </button>
              ) : null}
            </Field>
          </Section>
        ) : null}

        <Section title="Dados bancários" hint="Para onde vai o pagamento do vendedor.">
          <Field label="Banco" span={2} optional>
            <Input {...register("banco.banco")} />
          </Field>
          <Field label="Agência" span={1} optional>
            <Input {...register("banco.agencia")} />
          </Field>
          <Field label="Nº da conta" span={1} optional>
            <Input {...register("banco.conta_numero")} />
          </Field>
          <Field label="Chave Pix" span={2} optional>
            <Input {...register("banco.chave_pix")} />
          </Field>
        </Section>
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
