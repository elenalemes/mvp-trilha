"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm, type Path, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  incorporadoraEdicaoSchema,
  incorporadoraSchema,
  type IncorporadoraFormValues,
} from "@/lib/schemas";
import { MARITAL_STATUSES, PIX_KEY_TYPES, maskCNPJ, maskCPF, maskPhone } from "@/lib/br";
import {
  atualizarIncorporadora,
  atualizarPerfil,
  criarIncorporadora,
} from "@/app/actions/incorporadoras";
import { Alert, Button, Field, Input, Section, Select } from "@/components/ui";

type Values = IncorporadoraFormValues;

export const VALORES_VAZIOS: Values = {
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
};

export default function FormIncorporadora({
  modo,
  id,
  inicial = VALORES_VAZIOS,
}: {
  /** `perfil` é a própria incorporadora editando os dados dela. */
  modo: "criar" | "editar" | "perfil";
  id?: string;
  inicial?: Values;
}) {
  const router = useRouter();
  const perfil = modo === "perfil";
  const editando = modo === "editar" || perfil;
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(
      editando ? incorporadoraEdicaoSchema : incorporadoraSchema,
    ) as unknown as Resolver<Values>,
    mode: "onBlur",
    defaultValues: inicial,
  });

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

  /** No cadastro, sugere o e-mail do responsável como e-mail de acesso. */
  const emailResponsavel = () => {
    const campo = register("responsavel.email");
    if (editando) return campo;
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
    setSalvo(false);
    iniciar(async () => {
      const resultado = perfil
        ? await atualizarPerfil(valores)
        : editando
          ? await atualizarIncorporadora(id!, valores)
          : await criarIncorporadora(valores);

      if (resultado.erro) {
        setErro(resultado.erro);
        return;
      }

      if (perfil) {
        setSalvo(true);
        router.refresh();
        return;
      }

      router.push(`/incorporadoras/${resultado.id}`);
      router.refresh();
    });
  };

  const e = errors;
  const voltarPara = editando ? `/incorporadoras/${id}` : "/incorporadoras";

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
        <Field label="Endereço" span={6} optional>
          <Input placeholder="Rua, número, bairro, cidade/UF" {...register("empresa.endereco")} />
        </Field>
      </Section>

      <Section title="Dados bancários">
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
          <Select {...register("banco.chave_pix_tipo")}>
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
        hint="Quem assina pela incorporadora."
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
          <Select {...register("responsavel.estado_civil")}>
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

      {editando ? null : (
        <Section
          title="Acesso da incorporadora"
          hint="Anote a senha antes de salvar: depois ela não pode ser consultada, só trocada."
        >
          <Field
            label="E-mail de acesso"
            error={e.acesso?.email?.message}
            span={3}
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
      )}

      {erro ? <Alert>{erro}</Alert> : null}
      {salvo ? <Alert tone="ok">Seus dados foram atualizados.</Alert> : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pendente}>
          {pendente ? "Salvando…" : editando ? "Salvar alterações" : "Cadastrar incorporadora"}
        </Button>
        {perfil ? null : (
          <Link
            href={voltarPara}
            className="px-2 text-sm font-semibold text-muted-foreground underline-offset-4 hover:underline hover:text-foreground"
          >
            Cancelar
          </Link>
        )}
      </div>
    </form>
  );
}
