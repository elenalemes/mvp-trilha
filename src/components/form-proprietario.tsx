"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm, type Path, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  proprietarioEdicaoSchema,
  proprietarioSchema,
  type ProprietarioFormValues,
} from "@/lib/schemas";
import { MARITAL_STATUSES, PIX_KEY_TYPES, maskCPF, maskPhone } from "@/lib/br";
import { atualizarProprietario, criarProprietario } from "@/app/actions/proprietarios";
import { Alert, Button, Field, Input, Section, Select } from "@/components/ui";

type Values = ProprietarioFormValues;

export const PROPRIETARIO_VAZIO: Values = {
  pessoa: {
    nome: "",
    cpf: "",
    email: "",
    telefone: "",
    rg: "",
    endereco: "",
    profissao: "",
    estado_civil: "",
  },
  banco: { banco: "", agencia: "", conta_numero: "", chave_pix: "", chave_pix_tipo: "" },
  acesso: { email: "", senha: "" },
};

/**
 * Cadastro do proprietário PF. `perfil` é ele mesmo editando os próprios dados.
 * Os dados do cônjuge não ficam aqui: são pedidos no fechamento de cada negócio.
 */
export default function FormProprietario({
  modo,
  id,
  inicial = PROPRIETARIO_VAZIO,
}: {
  modo: "criar" | "editar" | "perfil";
  id?: string;
  inicial?: Values;
}) {
  const router = useRouter();
  const perfil = modo === "perfil";
  const editando = modo !== "criar";
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
    resolver: zodResolver(editando ? proprietarioEdicaoSchema : proprietarioSchema) as unknown as Resolver<Values>,
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

  /** No cadastro, sugere o e-mail pessoal como e-mail de acesso. */
  const emailPessoal = () => {
    const campo = register("pessoa.email");
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
      const r = perfil
        ? await atualizarProprietario(null, valores)
        : editando
          ? await atualizarProprietario(id!, valores)
          : await criarProprietario(valores);

      if (r.erro) {
        setErro(r.erro);
        return;
      }
      if (perfil) {
        setSalvo(true);
        router.refresh();
        return;
      }
      router.push(`/proprietarios/${r.id}`);
      router.refresh();
    });
  };

  const e = errors;
  const voltarPara = editando ? `/proprietarios/${id}` : "/proprietarios";

  return (
    <form onSubmit={handleSubmit(enviar)} className="flex flex-col gap-6" noValidate>
      <Section title="Dados pessoais">
        <Field label="CPF" error={e.pessoa?.cpf?.message} span={2}>
          <Input
            inputMode="numeric"
            placeholder="000.000.000-00"
            aria-invalid={!!e.pessoa?.cpf}
            {...comMascara("pessoa.cpf", maskCPF)}
          />
        </Field>
        <Field label="Nome completo" error={e.pessoa?.nome?.message} span={4}>
          <Input aria-invalid={!!e.pessoa?.nome} {...register("pessoa.nome")} />
        </Field>
        <Field label="E-mail" error={e.pessoa?.email?.message} span={3}>
          <Input type="email" aria-invalid={!!e.pessoa?.email} {...emailPessoal()} />
        </Field>
        <Field label="Telefone" error={e.pessoa?.telefone?.message} span={3}>
          <Input
            inputMode="numeric"
            placeholder="(53) 99999-9999"
            aria-invalid={!!e.pessoa?.telefone}
            {...comMascara("pessoa.telefone", maskPhone)}
          />
        </Field>
        <Field label="RG" span={2} optional>
          <Input {...register("pessoa.rg")} />
        </Field>
        <Field label="Profissão" span={2} optional>
          <Input {...register("pessoa.profissao")} />
        </Field>
        <Field label="Estado civil" span={2} optional>
          <Select {...register("pessoa.estado_civil")}>
            <option value="">Selecione</option>
            {MARITAL_STATUSES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Endereço" span={6} optional>
          <Input placeholder="Rua, número, bairro, cidade/UF" {...register("pessoa.endereco")} />
        </Field>
      </Section>

      <Section title="Dados bancários">
        <Field label="Banco" span={3} optional>
          <Input placeholder="Banco do Brasil, Itaú…" {...register("banco.banco")} />
        </Field>
        <Field label="Agência" span={1} optional>
          <Input {...register("banco.agencia")} />
        </Field>
        <Field label="Nº da conta" span={2} optional>
          <Input {...register("banco.conta_numero")} />
        </Field>
        <Field label="Tipo de chave Pix" span={2} optional>
          <Select {...register("banco.chave_pix_tipo")}>
            <option value="">Selecione</option>
            {PIX_KEY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Chave Pix" span={4} optional>
          <Input {...register("banco.chave_pix")} />
        </Field>
      </Section>

      {editando ? null : (
        <Section
          title="Acesso ao painel"
          hint="Anote a senha antes de salvar: depois ela não pode ser consultada, só trocada."
        >
          <Field label="E-mail de acesso" error={e.acesso?.email?.message} span={3}>
            <Input type="email" aria-invalid={!!e.acesso?.email} {...register("acesso.email")} />
          </Field>
          <Field label="Senha" error={e.acesso?.senha?.message} span={3} hint="Mínimo de 8 caracteres.">
            <Input type="text" autoComplete="off" aria-invalid={!!e.acesso?.senha} {...register("acesso.senha")} />
          </Field>
        </Section>
      )}

      {erro ? <Alert>{erro}</Alert> : null}
      {salvo ? <Alert tone="ok">Seus dados foram atualizados.</Alert> : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pendente}>
          {pendente ? "Salvando…" : editando ? "Salvar alterações" : "Cadastrar proprietário"}
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
