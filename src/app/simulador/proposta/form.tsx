"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { propostaSchema, type PropostaFormValues } from "@/lib/schemas";
import { enviarProposta } from "@/app/actions/propostas";
import { Alert, Button, Field, Input, Section, Textarea } from "@/components/ui";

export type CorretorConhecido = {
  nome: string;
  documento: string | null;
  creci: string | null;
  email: string;
  telefone: string;
};

/**
 * O formulário da proposta.
 *
 * Dois blocos: quem vende e quem compra. Quando o corretor já está logado, o
 * primeiro bloco vem preenchido e travado — ele confere de quem está saindo a
 * proposta em vez de digitar de novo o que o sistema já sabe.
 *
 * Dados bancários do corretor NÃO estão aqui. Eles só fazem sentido quando há
 * comissão a pagar; pedir no primeiro contato é atrito sem função.
 */
export default function FormProposta({
  empreendimentoId,
  imovelId,
  ordem,
  corretor,
}: {
  empreendimentoId: string;
  imovelId: string;
  ordem: number;
  corretor: CorretorConhecido | null;
}) {
  const [codigo, setCodigo] = useState<string | null>(null);
  const [erro, setErro] = useState<{ texto: string; precisaLogin: boolean } | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PropostaFormValues>({
    resolver: zodResolver(propostaSchema),
    defaultValues: {
      corretor: {
        nome: corretor?.nome ?? "",
        documento: corretor?.documento ?? "",
        creci: corretor?.creci ?? "",
        email: corretor?.email ?? "",
        telefone: corretor?.telefone ?? "",
      },
      comprador: { nome: "", cpf: "", email: "", telefone: "" },
      observacao: "",
    },
  });

  if (codigo) return <Confirmacao codigo={codigo} />;

  const onSubmit = async (v: PropostaFormValues) => {
    setErro(null);
    const r = await enviarProposta({
      empreendimentoId,
      imovelId,
      ordem,
      corretor: v.corretor,
      comprador: v.comprador,
      observacao: v.observacao,
    });

    if (r.ok) {
      setCodigo(r.codigo);
      return;
    }
    setErro({ texto: r.erro, precisaLogin: Boolean(r.precisaLogin) });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
      <Section
        title="Você"
        hint={
          corretor
            ? "Estes são os seus dados de cadastro. A proposta sai em seu nome."
            : "Se você ainda não tem cadastro na Trilha, ele é criado a partir daqui e a nossa equipe libera o seu acesso."
        }
      >
        <Field label="Nome" span={6} error={errors.corretor?.nome?.message}>
          <Input
            {...register("corretor.nome")}
            readOnly={Boolean(corretor)}
            className={corretor ? "bg-trilha-50 text-trilha-500" : ""}
            placeholder="Nome do corretor ou da imobiliária"
            aria-invalid={Boolean(errors.corretor?.nome)}
          />
        </Field>

        <Field label="CPF ou CNPJ" span={3} optional error={errors.corretor?.documento?.message}>
          <Input
            {...register("corretor.documento")}
            readOnly={Boolean(corretor)}
            className={corretor ? "bg-trilha-50 text-trilha-500" : ""}
            aria-invalid={Boolean(errors.corretor?.documento)}
          />
        </Field>

        <Field label="CRECI" span={3} optional error={errors.corretor?.creci?.message}>
          <Input
            {...register("corretor.creci")}
            readOnly={Boolean(corretor)}
            className={corretor ? "bg-trilha-50 text-trilha-500" : ""}
          />
        </Field>

        <Field label="E-mail" span={3} error={errors.corretor?.email?.message}>
          <Input
            type="email"
            {...register("corretor.email")}
            readOnly={Boolean(corretor)}
            className={corretor ? "bg-trilha-50 text-trilha-500" : ""}
            aria-invalid={Boolean(errors.corretor?.email)}
          />
        </Field>

        <Field label="Telefone" span={3} error={errors.corretor?.telefone?.message}>
          <Input
            {...register("corretor.telefone")}
            readOnly={Boolean(corretor)}
            className={corretor ? "bg-trilha-50 text-trilha-500" : ""}
            aria-invalid={Boolean(errors.corretor?.telefone)}
          />
        </Field>
      </Section>

      <Section title="O comprador" hint="Os dados de quem vai comprar a unidade.">
        <Field label="Nome completo" span={6} error={errors.comprador?.nome?.message}>
          <Input {...register("comprador.nome")} aria-invalid={Boolean(errors.comprador?.nome)} />
        </Field>

        <Field label="CPF" span={3} error={errors.comprador?.cpf?.message}>
          <Input {...register("comprador.cpf")} aria-invalid={Boolean(errors.comprador?.cpf)} />
        </Field>

        <Field label="Telefone" span={3} error={errors.comprador?.telefone?.message}>
          <Input
            {...register("comprador.telefone")}
            aria-invalid={Boolean(errors.comprador?.telefone)}
          />
        </Field>

        <Field label="E-mail" span={6} error={errors.comprador?.email?.message}>
          <Input
            type="email"
            {...register("comprador.email")}
            aria-invalid={Boolean(errors.comprador?.email)}
          />
        </Field>

        <Field
          label="Observação"
          span={6}
          optional
          hint="Algo que a equipe da Trilha precise saber sobre este negócio."
        >
          <Textarea rows={3} {...register("observacao")} />
        </Field>
      </Section>

      {erro ? (
        <Alert>
          {erro.texto}
          {erro.precisaLogin ? (
            <>
              {" "}
              <Link href="/login" className="font-semibold underline underline-offset-2">
                Fazer login
              </Link>
              .
            </>
          ) : null}
        </Alert>
      ) : null}

      <div className="flex items-center gap-4">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Enviando…" : "Enviar proposta"}
        </Button>
        <span className="text-sm text-trilha-400">Enviar não reserva a unidade.</span>
      </div>
    </form>
  );
}

/**
 * Depois de enviada.
 *
 * O código vem grande porque é o que o corretor vai citar quando perguntar do
 * andamento. E a tela diz o que acontece agora — quem espera sem saber o que
 * esperar liga no dia seguinte.
 */
function Confirmacao({ codigo }: { codigo: string }) {
  return (
    <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-8">
      <h2 className="font-display text-xl font-semibold text-emerald-900">Proposta enviada</h2>

      <p className="font-display mt-4 text-3xl font-bold tracking-wide text-emerald-900 tabular-nums">
        {codigo}
      </p>
      <p className="mt-1 text-sm text-emerald-800">
        Anote este código. É por ele que a gente encontra a sua proposta.
      </p>

      <div className="mt-6 flex flex-col gap-2 border-t border-emerald-200 pt-5 text-[15px] text-emerald-900">
        <p>A equipe da Trilha analisa o formato de pagamento e a qualificação do comprador.</p>
        <p>Enquanto isso a unidade segue disponível — outra proposta ainda pode chegar antes.</p>
        {/* Não prometer e-mail enquanto o envio não existir: o sistema ainda
            não notifica ninguém de nada. Quando o disparo entrar, esta linha
            volta a falar em aviso automático. */}
        <p>A equipe da Trilha entra em contato com você pelo telefone ou e-mail informado.</p>
      </div>

      <p className="mt-6">
        <Link
          href="/simulador"
          className="font-display font-semibold text-emerald-900 underline underline-offset-2"
        >
          Voltar ao simulador
        </Link>
      </p>
    </section>
  );
}
