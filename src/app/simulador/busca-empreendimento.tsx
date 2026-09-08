"use client";

import { useMemo, useRef, useState } from "react";
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
 * O campo NUNCA vira um cartão estático depois de escolher: ele continua
 * sendo um campo de busca, com o nome escolhido escrito dentro. Foi o
 * primeiro desenho e estava errado — quem escolhia perdia de vista que
 * aquilo era pesquisável, e o "Trocar" jogava a escolha inteira fora em vez
 * de deixar digitar por cima.
 *
 * A lista inteira vem do servidor e o filtro acontece aqui: são poucos
 * empreendimentos e nenhuma tecla precisa ir ao banco. A escolha vai para a
 * URL, não para o estado — é ela que o corretor manda pronto para o cliente.
 */
export function BuscaEmpreendimento({
  empreendimentos,
  selecionado,
}: {
  empreendimentos: EmpreendimentoSimulavel[];
  selecionado?: EmpreendimentoSimulavel;
}) {
  const router = useRouter();
  const nomeEscolhido = selecionado?.nome ?? "";
  const [texto, setTexto] = useState(nomeEscolhido);
  const [aberto, setAberto] = useState(false);
  const campo = useRef<HTMLInputElement>(null);

  // Quando a escolha muda no servidor, o campo acompanha. Ajustar o estado
  // durante a renderização, e não num efeito, é o padrão que o próprio React
  // recomenda para "estado derivado de prop": um efeito aqui renderizaria a
  // tela duas vezes a cada troca de unidade.
  const [ultimoNome, setUltimoNome] = useState(nomeEscolhido);
  if (nomeEscolhido !== ultimoNome) {
    setUltimoNome(nomeEscolhido);
    setTexto(nomeEscolhido);
  }

  const resultados = useMemo(() => {
    const termo = normalizar(texto.trim());
    // Campo em branco mostra tudo: o usuário clicou para ver as opções, não
    // para adivinhar o que digitar.
    const lista =
      termo === "" || termo === normalizar(nomeEscolhido)
        ? empreendimentos
        : empreendimentos.filter(
            (e) =>
              normalizar(e.nome).includes(termo) ||
              normalizar(e.incorporadora).includes(termo),
          );
    return lista.slice(0, MAX_RESULTADOS);
  }, [texto, empreendimentos, nomeEscolhido]);

  const escolher = (e: EmpreendimentoSimulavel) => {
    setAberto(false);
    campo.current?.blur();
    router.replace(`/simulador?e=${e.id}`);
  };

  const limpar = () => {
    setTexto("");
    setAberto(true);
    campo.current?.focus();
    if (selecionado) router.replace("/simulador");
  };

  return (
    <div className="relative">
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
          ref={campo}
          id="busca-empreendimento"
          type="text"
          autoComplete="off"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setAberto(true);
          }}
          onFocus={(e) => {
            setAberto(true);
            e.target.select();
          }}
          // O atraso deixa o clique num item acontecer antes de fechar a lista.
          onBlur={() => setTimeout(() => { setAberto(false); setTexto(nomeEscolhido); }, 150)}
          placeholder="Digite o nome do empreendimento"
          className="w-full rounded-md border border-trilha-200 bg-white py-2.5 pr-10 pl-10 text-[15px] text-trilha-900 placeholder:text-trilha-300 transition-colors hover:border-trilha-300 focus:border-trilha-500 focus:outline-none"
        />

        {texto ? (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={limpar}
            aria-label="Limpar empreendimento"
            className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-trilha-300 transition-colors hover:bg-trilha-50 hover:text-trilha-700"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-4" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        ) : null}
      </div>

      {aberto ? (
        resultados.length > 0 ? (
          <ul className="absolute z-20 mt-1 flex max-h-72 w-full flex-col divide-y divide-trilha-100 overflow-y-auto rounded-md border border-trilha-200 bg-white shadow-lg">
            {resultados.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => escolher(e)}
                  className={`flex w-full flex-col items-start px-4 py-3 text-left transition-colors hover:bg-trilha-50 ${
                    selecionado?.id === e.id ? "bg-trilha-50" : ""
                  }`}
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
        ) : (
          <p className="absolute z-20 mt-1 w-full rounded-md border border-trilha-200 bg-white px-4 py-3 text-sm text-trilha-400 shadow-lg">
            Nenhum empreendimento com esse nome.
          </p>
        )
      ) : null}
    </div>
  );
}
