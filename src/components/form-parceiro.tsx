"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm, type Path, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  parceiroEdicaoSchema,
  parceiroSchema,
  type ParceiroFormValues,
} from "@/lib/schemas";
import { PIX_KEY_TYPES, maskCNPJ, maskCPF, maskPhone } from "@/lib/br";
import { atualizarParceiro, criarParceiro } from "@/app/actions/parceiros";
import { Alert, Button, Checkbox, Field, Input, Section, Select } from "@/components/ui";

type Values = ParceiroFormValues;

export const PARCEIRO_VAZIO: Values = {
  dados: {
    nome: "",
    documento: "",
    creci: "",
    email: "",
    telefone: "",
    endereco: "",
    ativo: true,
  },
  banco: { banco: "", agencia: "", conta_numero: "", chave_pix: "", chave_pix_tipo: "" },
  acesso: { email: "", senha: "" },
};

/**
 * O documento aceita CPF e CNPJ na mesma caixa, porque o parceiro tanto pode
 * ser corretor quanto imobiliária. A máscara segue o que está sendo digitado:
 * até onze dígitos é CPF, daí em diante é CNPJ.
 */
const maskDocumento = (v: string) =>
  v.replace(/\D/g, "").length > 11 ? maskCNPJ(v) : maskCPF(v);

export default function FormParceiro({
  modo,
  id,
  incorporadoraId,
  inicial = PARCEIRO_VAZIO,
  voltarPara,
}: {
  modo: "criar" | "editar";
  id?: string;
  /** Só no cadastro: a quem este parceiro pertence. */
  /** Na criação: a incorporadora do parceiro. Nulo cria um Parceiro Trilha. */
  incorporadoraId?: string | null;
  inicial?: Values;
  voltarPara: string;
}) {
  const router = useRouter();
  const editando = modo === "editar";
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [pendente, iniciar] = useTransition();

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(
      editando ? parceiroEdicaoSchema : parceiroSchema,
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

  /** No cadastro, sugere o e-mail de contato como e-mail de acesso. */
  const emailContato = () => {
    const campo = register("dados.email");
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
      const resultado = editando
        ? await atualizarParceiro(id!, valores)
        : await criarParceiro(incorporadoraId ?? null, valores);

      if (resultado.erro) {
        setErro(resultado.erro);
        return;
      }

      if (editando) {
        setSalvo(true);
        router.refresh();
        return;
      }

      router.push(voltarPara);
      router.refresh();
    });
  };

  const e = errors;

  return (
    <form onSubmit={handleSubmit(enviar)} className="flex flex-col gap-6" noValidate>
      <Section
        title="Dados do parceiro"
      >
        <Field label="Nome" error={e.dados?.nome?.message} span={4}>
          <Input
            placeholder="Imobiliária Aurora, ou o nome do corretor"
            aria-invalid={!!e.dados?.nome}
            {...register("dados.nome")}
          />
        </Field>
        <Field
          label="CPF ou CNPJ"
          error={e.dados?.documento?.message}
          span={2}
          optional
          hint="Para o repasse da comissão"
        >
          <Input
            inputMode="numeric"
            placeholder="000.000.000-00"
            aria-invalid={!!e.dados?.documento}
            {...comMascara("dados.documento", maskDocumento)}
          />
        </Field>
        <Field label="CRECI" span={2} optional>
          <Input placeholder="CRECI/RS 00000" {...register("dados.creci")} />
        </Field>
        <Field label="E-mail" error={e.dados?.email?.message} span={2}>
          <Input type="email" aria-invalid={!!e.dados?.email} {...emailContato()} />
        </Field>
        <Field label="Telefone" error={e.dados?.telefone?.message} span={2}>
          <Input
            inputMode="numeric"
            placeholder="(53) 99999-9999"
            aria-invalid={!!e.dados?.telefone}
            {...comMascara("dados.telefone", maskPhone)}
          />
        </Field>
        <Field label="Endereço" span={6} optional>
          <Input placeholder="Rua, número, bairro, cidade/UF" {...register("dados.endereco")} />
        </Field>
        {editando ? (
          <div className="sm:col-span-6">
            <Checkbox label="Parceiro ativo" {...register("dados.ativo")} />
            <p className="text-sm text-muted-foreground">
              Desmarque para suspender o acesso sem apagar o cadastro.
            </p>
          </div>
        ) : null}
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

      {editando ? null : (
        <Section
          title="Acesso do parceiro"
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
      {salvo ? <Alert tone="ok">Dados do parceiro atualizados.</Alert> : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pendente}>
          {pendente ? "Salvando…" : editando ? "Salvar alterações" : "Cadastrar parceiro"}
        </Button>
        <Link
          href={voltarPara}
          className="px-2 text-sm font-semibold text-muted-foreground underline-offset-4 hover:underline hover:text-foreground"
        >
          {editando ? "Voltar" : "Cancelar"}
        </Link>
      </div>
    </form>
  );
}
