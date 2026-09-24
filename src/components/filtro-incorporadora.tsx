"use client";

import { useRouter, useSearchParams } from "next/navigation";

/**
 * Filtro por incorporadora. Guarda a escolha na própria URL, e não em estado
 * interno, para que o link possa ser compartilhado e o botão de voltar
 * funcione — é assim que os contadores da ficha da incorporadora chegam aqui.
 */
export function FiltroIncorporadora({
  incorporadoras,
  base,
}: {
  incorporadoras: { id: string; nome: string }[];
  base: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const atual = params.get("incorporadora") ?? "";

  return (
    <label className="flex items-center gap-2.5">
      <span className="text-sm font-semibold text-muted-foreground">
        Incorporadora
      </span>
      <select
        value={atual}
        onChange={(e) => {
          const valor = e.target.value;
          router.push(valor ? `${base}?incorporadora=${valor}` : base);
        }}
        className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground hover:border-foreground/20"
      >
        <option value="">Todas</option>
        {incorporadoras.map((i) => (
          <option key={i.id} value={i.id}>
            {i.nome}
          </option>
        ))}
      </select>
    </label>
  );
}
