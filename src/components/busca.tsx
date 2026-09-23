"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Campo de busca por texto. Escreve o termo na própria URL (`?q=`) em vez de
 * guardar só em estado interno, pelo mesmo motivo do filtro: o link fica
 * compartilhável e a página pode ser aberta já buscando.
 *
 * A consulta só dispara depois de uma pausa na digitação, para não ir ao
 * banco a cada tecla.
 */
export function Busca({ base, placeholder }: { base: string; placeholder: string }) {
  const router = useRouter();
  const params = useSearchParams();

  const [texto, setTexto] = useState(params.get("q") ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cancela a busca pendente se o componente sair da tela antes da pausa.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const aoDigitar = (valor: string) => {
    setTexto(valor);
    if (timer.current) clearTimeout(timer.current);

    timer.current = setTimeout(() => {
      const novos = new URLSearchParams(params.toString());
      if (valor.trim()) novos.set("q", valor.trim());
      else novos.delete("q");

      const query = novos.toString();
      router.replace(query ? `${base}?${query}` : base);
    }, 300);
  };

  return (
    <div className="relative w-full max-w-sm">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        className="pointer-events-none absolute top-1/2 left-3 size-[18px] -translate-y-1/2 text-muted-foreground/70"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>

      <input
        type="search"
        value={texto}
        onChange={(e) => aoDigitar(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full rounded-md border border-border bg-white py-2 pr-3 pl-10 text-[15px] text-foreground placeholder:text-muted-foreground transition-colors hover:border-foreground/20"
      />
    </div>
  );
}
