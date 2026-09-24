import { Suspense } from "react";
import Link from "next/link";
import { getSessao } from "@/lib/sessao";
import { LinkEntrar } from "@/components/link-entrar";

const ESTILO =
  "rounded-md border border-primary-foreground/30 px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-foreground/10 print:hidden";

/**
 * O botão do topo das páginas do simulador. Deslogado: "Entrar", que volta
 * para a mesma página depois do login. Logado: atalho para o painel.
 */
export async function AcessoCorretor() {
  const sessao = await getSessao();

  if (sessao?.conta) {
    return (
      <Link href="/" className={ESTILO}>
        Ir para o painel
      </Link>
    );
  }

  return (
    <Suspense
      fallback={
        <Link href="/login" className={ESTILO}>
          Entrar
        </Link>
      }
    >
      <LinkEntrar className={ESTILO}>Entrar</LinkEntrar>
    </Suspense>
  );
}
