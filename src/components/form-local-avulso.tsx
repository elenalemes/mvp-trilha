"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { localAvulsoSchema, type LocalAvulsoValues } from "@/lib/schemas";
import { salvarLocalAvulso } from "@/app/actions/proprietarios";
import { Alert, Button, Field, Input, Section } from "@/components/ui";

/**
 * Primeiro passo do imóvel avulso: onde ele fica. Vira o "empreendimento" no
 * banco; na tela é só o condomínio/edifício, ou o endereço se for casa.
 */
export default function FormLocalAvulso({
  proprietarioId,
  localId,
  inicial = { nome: "", endereco: "" },
  destino,
}: {
  proprietarioId: string;
  /** Preenchido ao editar um local que já existe. */
  localId?: string;
  inicial?: LocalAvulsoValues;
  /** Para onde ir depois de salvar. `{id}` é trocado pelo id do local. */
  destino: string;
}) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LocalAvulsoValues>({ resolver: zodResolver(localAvulsoSchema), defaultValues: inicial });

  const enviar = (v: LocalAvulsoValues) => {
    setErro(null);
    iniciar(async () => {
      const r = await salvarLocalAvulso(proprietarioId, localId ?? null, v);
      if (r.id === null) {
        setErro(r.erro);
        return;
      }
      router.push(destino.replace("{id}", r.id));
      router.refresh();
    });
  };

  return (
    <form onSubmit={handleSubmit(enviar)} className="flex flex-col gap-6" noValidate>
      <Section title="Onde fica" hint="Se for casa, use o próprio endereço como nome.">
        <Field label="Condomínio ou edifício" error={errors.nome?.message} span={3}>
          <Input placeholder="Ex.: Edifício Aurora" aria-invalid={!!errors.nome} {...register("nome")} />
        </Field>
        <Field label="Endereço" span={3} optional>
          <Input placeholder="Rua, número, bairro, cidade/UF" {...register("endereco")} />
        </Field>
      </Section>

      {erro ? <Alert>{erro}</Alert> : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pendente}>
          {pendente ? "Salvando…" : localId ? "Salvar" : "Continuar"}
        </Button>
        <Link
          href={`/proprietarios/${proprietarioId}`}
          className="px-2 text-sm font-semibold text-muted-foreground underline-offset-4 hover:underline hover:text-foreground"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
