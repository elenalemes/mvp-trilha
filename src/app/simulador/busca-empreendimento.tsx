"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { EmpreendimentoSimulavel } from "@/lib/simulador";

/** Ignora acentos e maiúsculas: "jardim" acha "Jardím". */
const normalizar = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

const MAX_RESULTADOS = 20;

/**
 * A escolha do empreendimento.
 *
 * A lista inteira vem do servidor e o filtro acontece aqui, em memória: são
 * poucos empreendimentos e nenhuma tecla precisa ir ao banco. A escolha vai
 * para a URL (`?e=...`), não para o estado — assim o corretor manda o link já
 * no empreendimento certo, e é essa mesma URL que vai carregar o contexto até
 * a proposta, mais adiante.
 */
export function BuscaEmpreendimento({
  empreendimentos,
  selecionado,
}: {
  empreendimentos: EmpreendimentoSimulavel[];
  selecionado?: EmpreendimentoSimulavel;
}) {
  const router = useRouter();
  const [texto, setTexto] = useState("");

  const resultados = useMemo(() => {
    const termo = normalizar(texto.trim());
    if (termo.length < 2) return [];
    return empreendimentos
      .filter(
        (e) =>
          normalizar(e.nome).includes(termo) || normalizar(e.incorporadora).includes(termo),
      )
      .slice(0, MAX_RESULTADOS);
  }, [texto, empreendimentos]);

  if (selecionado) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-trilha-200 bg-white px-5 py-4">
        <div>
          <p className="font-display text-xs font-semibold tracking-[0.12em] text-trilha-400 uppercase">
            Empreendimento
          </p>
          <p className="font-display text-lg font-semibold text-trilha-700">{selecionado.nome}</p>
          {selecionado.incorporadora ? (
            <p className="text-sm text-trilha-400">{selecionado.incorporadora}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => {
            setTexto("");
            router.replace("/simulador");
          }}
          className="font-display text-sm font-semibold tracking-wide text-trilha-500 uppercase underline underline-offset-2 hover:text-trilha-700"
        >
          Trocar
        </button>
      </div>
    );
  }

  const digitouPouco = texto.trim().length > 0 && texto.trim().length < 2;

  return (
    <div className="rounded-lg border border-trilha-200 bg-white p-5">
      <label
        htmlFor="busca-empreendimento"
        className="font-display mb-1.5 block text-sm font-semibold tracking-wide text-trilha-700 uppercase"
      >
        Empreendimento
      </label>

      <div className="relative">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          className="pointer-events-none absolute top-1/2 left-3 size-[18px] -translate-y-1/2 text-trilha-300"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>

        <input
          id="busca-empreendimento"
          type="search"
          autoComplete="off"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Digite o nome do empreendimento"
          className="w-full rounded-md border border-trilha-200 bg-white py-2.5 pr-3 pl-10 text-[15px] text-trilha-900 placeholder:text-trilha-300 transition-colors hover:border-trilha-300 focus:border-trilha-500 focus:outline-none"
        />
      </div>

      {digitouPouco ? (
        <p className="mt-3 text-sm text-trilha-400">Digite ao menos duas letras.</p>
      ) : null}

      {texto.trim().length >= 2 && resultados.length === 0 ? (
        <p className="mt-3 text-sm text-trilha-400">
          Nenhum empreendimento encontrado. Confira o nome com quem está te atendendo.
        </p>
      ) : null}

      {resultados.length > 0 ? (
        <ul className="mt-3 flex flex-col divide-y divide-trilha-100 overflow-hidden rounded-md border border-trilha-100">
          {resultados.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => router.replace(`/simulador?e=${e.id}`)}
                className="flex w-full flex-col items-start px-4 py-3 text-left transition-colors hover:bg-trilha-50"
              >
                <span className="font-display text-[16px] font-semibold text-trilha-700">
                  {e.nome}
                </span>
                {e.incorporadora ? (
                  <span className="text-sm text-trilha-400">{e.incorporadora}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
