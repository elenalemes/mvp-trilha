"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { acessoSchema, type AcessoFormValues } from "@/lib/schemas";
import { atualizarAcesso } from "@/app/actions/incorporadoras";
import { Alert, Button, Field, Input, Section } from "@/components/ui";

export default function FormAcesso({ id, emailAtual }: { id: string; emailAtual: string }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [pendente, iniciar] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AcessoFormValues>({
    resolver: zodResolver(acessoSchema),
    mode: "onBlur",
    defaultValues: { email: emailAtual, senha: "" },
  });

  const enviar = (valores: AcessoFormValues) => {
    setErro(null);
    setSalvo(false);
    iniciar(async () => {
      const resultado = await atualizarAcesso(id, valores);
      if (resultado.erro) {
        setErro(resultado.erro);
        return;
      }
      setSalvo(true);
      reset({ email: valores.email, senha: "" });
      router.refresh();
    });
  };

  return (
    <form onSubmit={handleSubmit(enviar)} className="flex flex-col gap-6" noValidate>
      <Section
        title="Acesso da incorporadora"
        hint="É com esses dados que a incorporadora entra na plataforma. A senha atual não pode ser consultada — só substituída."
      >
        <Field label="E-mail de acesso" error={errors.email?.message} span={3}>
          <Input type="email" aria-invalid={!!errors.email} {...register("email")} />
        </Field>
        <Field
          label="Nova senha"
          error={errors.senha?.message}
          span={3}
          optional
          hint="Deixe em branco para manter a senha atual. Mínimo de 8 caracteres."
        >
          <Input
            type="text"
            autoComplete="off"
            placeholder="••••••••"
            aria-invalid={!!errors.senha}
            {...register("senha")}
          />
        </Field>
      </Section>

      {erro ? <Alert>{erro}</Alert> : null}
      {salvo ? (
        <Alert tone="ok">
          Acesso atualizado. Se você definiu uma senha nova, anote e entregue à incorporadora — ela
          não poderá ser consultada depois.
        </Alert>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pendente}>
          {pendente ? "Salvando…" : "Salvar acesso"}
        </Button>
        <Link
          href={`/incorporadoras/${id}`}
          className="font-display px-2 text-[15px] font-semibold tracking-wide text-trilha-400 underline underline-offset-2 hover:text-trilha-700"
        >
          Voltar
        </Link>
      </div>
    </form>
  );
}
