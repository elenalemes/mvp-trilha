"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { empreendimentoSchema, type EmpreendimentoFormValues } from "@/lib/schemas";
import { criarEmpreendimento } from "@/app/actions/empreendimentos";
import { Alert, Button, Field, Input, Section, Select } from "@/components/ui";

export default function NovoEmpreendimentoForm({
  incorporadoras,
  admin,
  preSelecionada,
}: {
  incorporadoras: { id: string; nome: string }[];
  admin: boolean;
  preSelecionada: string;
}) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EmpreendimentoFormValues>({
    resolver: zodResolver(empreendimentoSchema),
    mode: "onBlur",
    defaultValues: {
      incorporadora_id: preSelecionada || incorporadoras[0]?.id || "",
      nome: "",
      endereco: "",
    },
  });

  const enviar = (valores: EmpreendimentoFormValues) => {
    setErro(null);
    iniciar(async () => {
      const resultado = await criarEmpreendimento(valores);
      if (resultado.erro) {
        setErro(resultado.erro);
        return;
      }
      router.push(`/imoveis/novo?empreendimento=${resultado.id}`);
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

        <Field label="Endereço" error={errors.endereco?.message} span={6} optional>
          <Input placeholder="Rua, número, bairro, cidade/UF" {...register("endereco")} />
        </Field>
      </Section>

      {erro ? <Alert>{erro}</Alert> : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pendente}>
          {pendente ? "Salvando…" : "Salvar e cadastrar imóveis"}
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
