import { TelaDeEntrada } from "@/components/publico";
import { buttonVariants } from "@/components/shadcn/button";
import { cn } from "@/lib/utils";
import type { Metadata } from "next";
import Link from "next/link";
import { lerConvite } from "@/lib/convite";
import FormPrimeiroAcesso from "./form";

/**
 * O primeiro acesso do corretor.
 *
 * Quem chega aqui veio de um link no WhatsApp e não tem sessão nenhuma. O
 * token é a única credencial: usá-lo é a prova de que aquele número é mesmo
 * dele — é isso que substitui a aprovação manual que existia antes.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Primeiro acesso · Trilha",
  robots: { index: false, follow: false },
};

const RECADO: Record<string, string> = {
  usado: "Este convite já foi usado. Entre com o seu e-mail e a senha que você definiu.",
  expirado: "Este convite venceu. Peça um novo à equipe da Trilha — leva um minuto.",
  invalido: "Não encontrei este convite. Confira se o link veio inteiro na mensagem.",
};

export default async function PrimeiroAcessoPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  const convite = t ? await lerConvite(t) : ({ ok: false, motivo: "invalido" } as const);

  return (
    <TelaDeEntrada>
      {!convite.ok ? (
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Convite indisponível</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">{RECADO[convite.motivo]}</p>
          <Link href="/login" className={cn(buttonVariants({ variant: "default" }), "mt-6 h-10 w-full")}>
            Ir para o login
          </Link>
        </div>
      ) : (
        <div className="flex flex-col">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Bem-vindo, {convite.parceiro.nome.trim().split(/\s+/)[0]}
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            Defina uma senha para entrar na plataforma e acompanhar as suas propostas
            {convite.parceiro.incorporadora ? ` na ${convite.parceiro.incorporadora}` : ""}.
          </p>

          <p className="mt-5 rounded-lg bg-muted px-4 py-3 text-sm text-foreground">
            Seu e-mail de acesso: <strong className="font-semibold">{convite.parceiro.email}</strong>
          </p>

          <div className="mt-6">
            <FormPrimeiroAcesso token={t!} />
          </div>
        </div>
      )}
    </TelaDeEntrada>
  );
}
