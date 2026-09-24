"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * "Entrar" que traz a pessoa de volta para onde ela estava — a mesma unidade
 * do simulador, a mesma proposta pela metade. O endereço de volta é sempre
 * relativo; o login confere de novo antes de usar.
 */
export function LinkEntrar({ className, children }: { className?: string; children: React.ReactNode }) {
  const caminho = usePathname();
  const busca = useSearchParams().toString();
  const voltar = busca ? `${caminho}?${busca}` : caminho;
  return (
    <Link href={`/login?voltar=${encodeURIComponent(voltar)}`} className={className}>
      {children}
    </Link>
  );
}
