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
    <main className="flex min-h-screen items-center justify-center bg-trilha-50/40 px-5 py-12">
      <div className="w-full max-w-md">
        <p className="font-display mb-8 text-sm font-semibold tracking-[0.18em] text-trilha-500 uppercase">
          Trilha
        </p>

        {!convite.ok ? (
          <div className="rounded-lg border border-trilha-200 bg-white p-8">
            <h1 className="font-display text-2xl font-bold text-trilha-900">Convite indisponível</h1>
            <p className="mt-3 text-[15px] text-trilha-400">{RECADO[convite.motivo]}</p>
            <p className="mt-6">
              <Link
                href="/login"
                className="font-display font-semibold text-trilha-700 underline underline-offset-2"
              >
                Ir para o login
              </Link>
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-trilha-200 bg-white p-8">
            <h1 className="font-display text-2xl font-bold text-trilha-900">
              Bem-vindo, {convite.parceiro.nome.trim().split(/\s+/)[0]}
            </h1>
            <p className="mt-2 text-[15px] text-trilha-400">
              Defina uma senha para entrar na plataforma e acompanhar as suas propostas
              {convite.parceiro.incorporadora ? ` na ${convite.parceiro.incorporadora}` : ""}.
            </p>

            <p className="mt-4 rounded-md bg-trilha-50 px-4 py-3 text-sm text-trilha-700">
              Seu e-mail de acesso: <strong>{convite.parceiro.email}</strong>
            </p>

            <div className="mt-6">
              <FormPrimeiroAcesso token={t!} />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
