"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { empreendimentoSchema, type EmpreendimentoFormValues } from "@/lib/schemas";
import { atualizarEmpreendimento, criarEmpreendimento } from "@/app/actions/empreendimentos";
import { Alert, Button, Field, Input, Section, Select } from "@/components/ui";

export default function FormEmpreendimento({
  modo,
  id,
  incorporadoras,
  admin,
  inicial,
}: {
  modo: "criar" | "editar";
  id?: string;
  incorporadoras: { id: string; nome: string }[];
  admin: boolean;
  inicial: EmpreendimentoFormValues;
}) {
  const router = useRouter();
  const editando = modo === "editar";
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EmpreendimentoFormValues>({
    resolver: zodResolver(empreendimentoSchema),
    mode: "onBlur",
    defaultValues: inicial,
  });

  const enviar = (valores: EmpreendimentoFormValues) => {
    setErro(null);
    iniciar(async () => {
      const resultado = editando
        ? await atualizarEmpreendimento(id!, valores)
        : await criarEmpreendimento(valores);

      if (resultado.erro) {
        setErro(resultado.erro);
        return;
      }

      router.push(
        editando
          ? `/empreendimentos/${id}`
          : `/empreendimentos/${resultado.id}/imoveis/novo`,
      );
      router.refresh();
    });
  };

  return (
    <form onSubmit={handleSubmit(enviar)} className="flex flex-col gap-6" noValidate>
      <Section title="Dados do empreendimento">
        {admin ? (
          <Field label="Incorporadora" error={errors.incorporadora_id?.message} span={6}>
            <Select aria-invalid={!!errors.incorporadora_id} {...register("incorporadora_id")}>
              {incorporadoras.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.nome}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <input type="hidden" {...register("incorporadora_id")} />
        )}

        <Field label="Nome" error={errors.nome?.message} span={6}>
          <Input
            placeholder="Residencial Parque Anchieta"
            aria-invalid={!!errors.nome}
            {...register("nome")}
          />
        </Field>

        <Field label="Endereço" span={6} optional>
          <Input placeholder="Rua, número, bairro, cidade/UF" {...register("endereco")} />
        </Field>
      </Section>

      {erro ? <Alert>{erro}</Alert> : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pendente}>
          {pendente ? "Salvando…" : editando ? "Salvar alterações" : "Salvar e cadastrar imóveis"}
        </Button>
        <Link
          href="/empreendimentos"
          className="font-display px-2 text-[15px] font-semibold tracking-wide text-trilha-400 underline underline-offset-2 hover:text-trilha-700"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
