"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { loginSchema } from "@/lib/schemas";
import { signIn } from "@/app/actions/auth";
import { Alert, Button, Field, Input } from "@/components/ui";

type Values = z.infer<typeof loginSchema>;

export default function LoginForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(loginSchema) });

  const onSubmit = (values: Values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await signIn(values.email, values.password);
      if (result.error) {
        setServerError(result.error);
        return;
      }
      router.replace("/incorporadoras");
      router.refresh();
    });
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-5"
      noValidate
    >
      <Field label="E-mail" error={errors.email?.message} span={6}>
        <Input
          type="email"
          autoComplete="email"
          placeholder="voce@trilha.online"
          aria-invalid={!!errors.email}
          {...register("email")}
        />
      </Field>

      <Field label="Senha" error={errors.password?.message} span={6}>
        <Input
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          aria-invalid={!!errors.password}
          {...register("password")}
        />
      </Field>

      {serverError ? <Alert>{serverError}</Alert> : null}

      <Button type="submit" disabled={pending} className="mt-1 h-10 w-full">
        {pending ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  );
}
