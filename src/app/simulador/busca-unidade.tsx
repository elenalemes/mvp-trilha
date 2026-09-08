"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { UnidadeSimulavel } from "@/lib/simulador";
import { caracteristicas } from "@/lib/unidade";

const normalizar = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

const MAX_RESULTADOS = 20;

/**
 * A escolha da unidade, dentro do empreendimento já selecionado.
 *
 * Mesmo desenho da busca de empreendimento: a lista vem inteira do servidor e
 * o filtro é em memória. Aqui a lista é maior — um prédio pode ter centenas de
 * unidades —, mas cada linha carrega quase nada, e ir ao banco a cada tecla
 * seria pior para quem está digitando na frente de um cliente.
 */
export function BuscaUnidade({
  empreendimentoId,
  unidades,
  selecionada,
}: {
  empreendimentoId: string;
  unidades: UnidadeSimulavel[];
  selecionada?: UnidadeSimulavel;
}) {
  const router = useRouter();
  const [texto, setTexto] = useState("");

  const resultados = useMemo(() => {
    const termo = normalizar(texto.trim());
    const lista = termo
      ? unidades.filter(
          (u) =>
            normalizar(u.identificacao).includes(termo) ||
            normalizar(u.tipologia ?? "").includes(termo),
        )
      : unidades;
    return lista.slice(0, MAX_RESULTADOS);
  }, [texto, unidades]);

  if (selecionada) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-trilha-200 bg-white px-5 py-4">
        <div>
          <p className="font-display text-xs font-semibold tracking-[0.12em] text-trilha-400 uppercase">
            Unidade
          </p>
          <p className="font-display text-lg font-semibold text-trilha-700">
            {selecionada.identificacao}
          </p>
          {caracteristicas(selecionada) ? (
            <p className="text-sm text-trilha-400">{caracteristicas(selecionada)}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => {
            setTexto("");
            router.replace(`/simulador?e=${empreendimentoId}`);
          }}
          className="font-display text-sm font-semibold tracking-wide text-trilha-500 uppercase underline underline-offset-2 hover:text-trilha-700"
        >
          Trocar
        </button>
      </div>
    );
  }

  if (unidades.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-trilha-200 bg-white px-6 py-10 text-center">
        <p className="font-display text-lg font-semibold text-trilha-700">
          Nenhuma unidade disponível
        </p>
        <p className="mx-auto mt-1 max-w-md text-[15px] text-trilha-400">
          Este empreendimento não tem unidades disponíveis no momento. Fale com quem está te
          atendendo.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-trilha-200 bg-white p-5">
      <label
        htmlFor="busca-unidade"
        className="font-display mb-1.5 block text-sm font-semibold tracking-wide text-trilha-700 uppercase"
      >
        Unidade
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
          id="busca-unidade"
          type="search"
          autoComplete="off"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Digite a unidade — ex.: 302"
          className="w-full rounded-md border border-trilha-200 bg-white py-2.5 pr-3 pl-10 text-[15px] text-trilha-900 placeholder:text-trilha-300 transition-colors hover:border-trilha-300 focus:border-trilha-500 focus:outline-none"
        />
      </div>

      <p className="mt-2 text-xs text-trilha-400">
        {unidades.length} unidade{unidades.length === 1 ? "" : "s"} disponível
        {unidades.length === 1 ? "" : "is"}
        {texto.trim() ? ` · ${resultados.length} na busca` : ""}
      </p>

      {resultados.length === 0 ? (
        <p className="mt-3 text-sm text-trilha-400">
          Nenhuma unidade encontrada com esse texto.
        </p>
      ) : (
        <ul className="mt-3 flex max-h-80 flex-col divide-y divide-trilha-100 overflow-y-auto rounded-md border border-trilha-100">
          {resultados.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                onClick={() => router.replace(`/simulador?e=${empreendimentoId}&u=${u.id}`)}
                className="flex w-full flex-col items-start px-4 py-3 text-left transition-colors hover:bg-trilha-50"
              >
                <span className="font-display text-[16px] font-semibold text-trilha-700">
                  {u.identificacao}
                </span>
                {caracteristicas(u) ? (
                  <span className="text-sm text-trilha-400">{caracteristicas(u)}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
