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
      <span className="font-display text-sm font-semibold tracking-wide text-trilha-400 uppercase">
        Incorporadora
      </span>
      <select
        value={atual}
        onChange={(e) => {
          const valor = e.target.value;
          router.push(valor ? `${base}?incorporadora=${valor}` : base);
        }}
        className="rounded-md border border-trilha-200 bg-white px-3 py-1.5 text-[15px] text-trilha-900 hover:border-trilha-300"
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
