"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm, type Path } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { incorporadoraSchema, type IncorporadoraFormValues } from "@/lib/schemas";
import { MARITAL_STATUSES, PIX_KEY_TYPES, maskCNPJ, maskCPF, maskPhone } from "@/lib/br";
import { criarIncorporadora } from "@/app/actions/incorporadoras";
import { Alert, Button, Field, Input, Section, Select } from "@/components/ui";

type Values = IncorporadoraFormValues;

export default function NovaIncorporadoraForm() {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(incorporadoraSchema),
    mode: "onBlur",
    defaultValues: {
      empresa: { nome: "", cnpj: "", email: "", telefone: "", endereco: "" },
      banco: { banco: "", agencia: "", conta_numero: "", chave_pix: "", chave_pix_tipo: "" },
      responsavel: {
        nome: "",
        cpf: "",
        rg: "",
        profissao: "",
        cargo: "",
        estado_civil: "",
        email: "",
        telefone: "",
        endereco: "",
      },
      acesso: { email: "", senha: "" },
    },
  });

  /** register + máscara aplicada a cada tecla. */
  const comMascara = (nome: Path<Values>, mascara: (v: string) => string) => {
    const campo = register(nome);
    return {
      ...campo,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        e.target.value = mascara(e.target.value);
        return campo.onChange(e);
      },
    };
  };

  /** Ao sair do e-mail do responsável, sugere o mesmo como e-mail de acesso. */
  const emailResponsavel = () => {
    const campo = register("responsavel.email");
    return {
      ...campo,
      onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
        if (!getValues("acesso.email") && e.target.value) {
          setValue("acesso.email", e.target.value, { shouldValidate: true });
        }
        return campo.onBlur(e);
      },
    };
  };

  const enviar = (valores: Values) => {
    setErro(null);
    iniciar(async () => {
      const resultado = await criarIncorporadora(valores);
      if (resultado.erro) {
        setErro(resultado.erro);
        return;
      }
      router.push(`/incorporadoras/${resultado.id}`);
      router.refresh();
    });
  };

  const e = errors;

  return (
    <form onSubmit={handleSubmit(enviar)} className="flex flex-col gap-6" noValidate>
      <Section title="Dados da incorporadora">
        <Field label="CNPJ" error={e.empresa?.cnpj?.message} span={2}>
          <Input
            inputMode="numeric"
            placeholder="00.000.000/0000-00"
            aria-invalid={!!e.empresa?.cnpj}
            {...comMascara("empresa.cnpj", maskCNPJ)}
          />
        </Field>
        <Field label="Nome da incorporadora" error={e.empresa?.nome?.message} span={4}>
          <Input aria-invalid={!!e.empresa?.nome} {...register("empresa.nome")} />
        </Field>
        <Field label="E-mail corporativo" error={e.empresa?.email?.message} span={4}>
          <Input
            type="email"
            placeholder="contato@incorporadora.com.br"
            aria-invalid={!!e.empresa?.email}
            {...register("empresa.email")}
          />
        </Field>
        <Field label="Telefone" error={e.empresa?.telefone?.message} span={2}>
          <Input
            inputMode="numeric"
            placeholder="(53) 99999-9999"
            aria-invalid={!!e.empresa?.telefone}
            {...comMascara("empresa.telefone", maskPhone)}
          />
        </Field>
        <Field label="Endereço" error={e.empresa?.endereco?.message} span={6} optional>
          <Input
            placeholder="Rua, número, bairro, cidade/UF"
            {...register("empresa.endereco")}
          />
        </Field>
      </Section>

      <Section title="Dados bancários" hint="Conta que vai receber os repasses.">
        <Field label="Nome do banco" span={3} optional>
          <Input placeholder="Banco do Brasil, Itaú…" {...register("banco.banco")} />
        </Field>
        <Field label="Agência" span={1} optional>
          <Input {...register("banco.agencia")} />
        </Field>
        <Field label="Nº da conta" span={2} optional>
          <Input {...register("banco.conta_numero")} />
        </Field>
        <Field label="Tipo de chave PIX" span={2} optional>
          <Select defaultValue="" {...register("banco.chave_pix_tipo")}>
            <option value="">Selecione</option>
            {PIX_KEY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Chave PIX" span={4} optional>
          <Input {...register("banco.chave_pix")} />
        </Field>
      </Section>

      <Section
        title="Responsável"
        hint="Pessoa que responde e assina pela incorporadora nos negócios com a Trilha."
      >
        <Field label="CPF" error={e.responsavel?.cpf?.message} span={2}>
          <Input
            inputMode="numeric"
            placeholder="000.000.000-00"
            aria-invalid={!!e.responsavel?.cpf}
            {...comMascara("responsavel.cpf", maskCPF)}
          />
        </Field>
        <Field label="Nome completo" error={e.responsavel?.nome?.message} span={4}>
          <Input aria-invalid={!!e.responsavel?.nome} {...register("responsavel.nome")} />
        </Field>
        <Field label="RG" span={2} optional>
          <Input {...register("responsavel.rg")} />
        </Field>
        <Field label="Profissão" span={2} optional>
          <Input {...register("responsavel.profissao")} />
        </Field>
        <Field label="Cargo na empresa" span={2} optional>
          <Input placeholder="Diretor comercial…" {...register("responsavel.cargo")} />
        </Field>
        <Field label="Estado civil" span={2} optional>
          <Select defaultValue="" {...register("responsavel.estado_civil")}>
            <option value="">Selecione</option>
            {MARITAL_STATUSES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="E-mail" error={e.responsavel?.email?.message} span={2}>
          <Input type="email" aria-invalid={!!e.responsavel?.email} {...emailResponsavel()} />
        </Field>
        <Field label="Telefone" error={e.responsavel?.telefone?.message} span={2}>
          <Input
            inputMode="numeric"
            placeholder="(53) 99999-9999"
            aria-invalid={!!e.responsavel?.telefone}
            {...comMascara("responsavel.telefone", maskPhone)}
          />
        </Field>
        <Field label="Endereço" span={6} optional>
          <Input
            placeholder="Rua, número, bairro, cidade/UF"
            {...register("responsavel.endereco")}
          />
        </Field>
      </Section>

      <Section
        title="Acesso da incorporadora"
        hint="Com estes dados a incorporadora entra na plataforma e cadastra os próprios imóveis. Anote a senha e entregue a ela — não dá para consultá-la depois."
      >
        <Field
          label="E-mail de acesso"
          error={e.acesso?.email?.message}
          span={3}
          hint="Sugerido a partir do e-mail do responsável. Pode trocar."
        >
          <Input type="email" aria-invalid={!!e.acesso?.email} {...register("acesso.email")} />
        </Field>
        <Field
          label="Senha"
          error={e.acesso?.senha?.message}
          span={3}
          hint="Mínimo de 8 caracteres."
        >
          <Input
            type="text"
            autoComplete="off"
            aria-invalid={!!e.acesso?.senha}
            {...register("acesso.senha")}
          />
        </Field>
      </Section>

      {erro ? <Alert>{erro}</Alert> : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pendente}>
          {pendente ? "Salvando…" : "Cadastrar incorporadora"}
        </Button>
        <Link
          href="/incorporadoras"
          className="font-display px-2 text-[15px] font-semibold tracking-wide text-trilha-400 underline underline-offset-2 hover:text-trilha-700"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
