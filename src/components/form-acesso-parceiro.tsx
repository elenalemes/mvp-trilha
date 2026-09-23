"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { acessoNovoSchema, acessoSchema, type AcessoFormValues } from "@/lib/schemas";
import { atualizarAcessoParceiro, criarAcessoParceiro } from "@/app/actions/parceiros";
import { Alert, Button, Field, Input, Section } from "@/components/ui";

/**
 * O acesso de um parceiro, nos dois momentos.
 *
 * `criar` é a aprovação de quem chegou por proposta e ainda não tem login —
 * criar o acesso também liga o cadastro. `editar` só troca e-mail e senha de
 * quem já entra.
 *
 * Mesmos campos nos dois, então é o mesmo formulário: o que muda é a
 * obrigatoriedade da senha, a action e o texto.
 */
export default function FormAcessoParceiro({
  id,
  emailAtual,
  voltarPara,
  modo = "editar",
}: {
  id: string;
  emailAtual: string;
  voltarPara: string;
  modo?: "criar" | "editar";
}) {
  const criando = modo === "criar";
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
    resolver: zodResolver(criando ? acessoNovoSchema : acessoSchema),
    mode: "onBlur",
    defaultValues: { email: emailAtual, senha: "" },
  });

  const enviar = (valores: AcessoFormValues) => {
    setErro(null);
    setSalvo(false);
    iniciar(async () => {
      const resultado = criando
        ? await criarAcessoParceiro(id, valores)
        : await atualizarAcessoParceiro(id, valores);
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
        title={criando ? "Criar acesso do parceiro" : "Acesso do parceiro"}
        hint={
          criando
            ? "Criar o acesso também ativa o cadastro: a partir daqui ele entra na plataforma e enxerga as unidades disponíveis da incorporadora. Anote a senha — ela não poderá ser consultada depois."
            : "É com esses dados que ele entra na plataforma. A senha atual não pode ser consultada — só substituída."
        }
      >
        <Field label="E-mail de acesso" error={errors.email?.message} span={3}>
          <Input type="email" aria-invalid={!!errors.email} {...register("email")} />
        </Field>
        <Field
          label={criando ? "Senha" : "Nova senha"}
          error={errors.senha?.message}
          span={3}
          optional={!criando}
          hint={
            criando
              ? "Mínimo de 8 caracteres. Entregue ao parceiro junto com o e-mail."
              : "Deixe em branco para manter a senha atual. Mínimo de 8 caracteres."
          }
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
          {criando
            ? "Acesso criado e parceiro ativado. Entregue o e-mail e a senha a ele — a senha não poderá ser consultada depois."
            : "Acesso atualizado. Se você definiu uma senha nova, anote e entregue ao parceiro — ela não poderá ser consultada depois."}
        </Alert>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pendente}>
          {pendente ? "Salvando…" : criando ? "Criar acesso e ativar" : "Salvar acesso"}
        </Button>
        <Link
          href={voltarPara}
          className="px-2 text-[15px] font-semibold text-muted-foreground underline-offset-4 hover:underline hover:text-foreground"
        >
          Voltar
        </Link>
      </div>
    </form>
  );
}
