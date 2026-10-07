"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { marcarPaga, desmarcarPaga } from "@/app/actions/parcelas";
import { gerarCobranca } from "@/app/actions/cobranca";
import { estaAtrasada, type Parcela } from "@/lib/jornada";
import { formatBRL } from "@/lib/br";
import { Alert } from "@/components/ui";

/**
 * O extrato da jornada.
 *
 * Uma linha por mês, do primeiro ao último, sempre todas — esconder as futuras
 * pouparia rolagem e tiraria justamente o que o comprador pergunta ("quando
 * termina?"). A parcela do mês corrente fica marcada, e as atrasadas em
 * vermelho: é o único número desta tela que faz alguém pegar o telefone.
 *
 * Só a Trilha vê o controle de marcar e a coluna de cobrança. Os outros leem —
 * para a incorporadora isto é a liquidez dela, para o corretor é a comissão.
 *
 * Cobrança: parcela em aberto sem cobrança mostra "gerar"; com cobrança, o
 * link do Asaas (a fatura Pix que o comprador recebe). Se a última tentativa
 * falhou, o motivo fica na linha — é o Asaas falando, em português.
 */
export default function ParcelasTrilha({
  parcelas,
  negocioId,
  podeMarcar,
}: {
  parcelas: Parcela[];
  negocioId: string;
  podeMarcar: boolean;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const alternar = async (p: Parcela) => {
    setOcupado(p.id);
    setErro(null);
    const r = p.status === "paga"
      ? await desmarcarPaga(p.id, negocioId)
      : await marcarPaga(p.id, negocioId);
    setOcupado(null);
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    router.refresh();
  };

  const cobrar = async (p: Parcela) => {
    setOcupado(p.id);
    setErro(null);
    const r = await gerarCobranca(p.id, negocioId);
    setOcupado(null);
    if (!r.ok) {
      setErro(`${p.numero === 0 ? "Ato" : `Parcela ${p.numero}`}: ${r.erro}`);
    }
    router.refresh();
  };

  const colunas = podeMarcar
    ? ["Parcela", "Vencimento", "Valor", "Situação", "Cobrança"]
    : ["Parcela", "Vencimento", "Valor", "Situação"];

  return (
    <div className="flex flex-col gap-3">
      {erro ? <Alert>{erro}</Alert> : null}

      <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead>
            <tr className="border-b border-border">
              {colunas.map((h) => (
                <th
                  key={h}
                  className="bg-muted/50 px-4 py-2.5 text-xs font-medium whitespace-nowrap text-muted-foreground"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {parcelas.map((p) => {
              const atrasada = estaAtrasada(p);
              const paga = p.status === "paga";

              return (
                <tr
                  key={p.id}
                  className="border-b border-border transition-colors last:border-0 hover:bg-muted/40"
                >
                  <td className="px-4 py-2.5 text-sm tabular-nums text-muted-foreground">
                    {p.numero === 0 ? "Ato" : p.numero}
                  </td>

                  <td className="px-4 py-2.5 text-sm tabular-nums">
                    <span className={atrasada ? "font-medium text-destructive" : "text-foreground"}>
                      {new Date(`${p.vencimento}T12:00:00`).toLocaleDateString("pt-BR")}
                    </span>
                  </td>

                  <td className="px-4 py-2.5 text-sm tabular-nums text-foreground">
                    {formatBRL(p.valor)}
                  </td>

                  <td className="px-4 py-2.5 text-sm whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        aria-hidden="true"
                        className={`size-1.5 rounded-full ${paga ? "bg-sucesso" : atrasada ? "bg-destructive" : "bg-border"}`}
                      />
                      <span className={atrasada ? "text-destructive" : "text-muted-foreground"}>
                        {paga ? "Paga" : atrasada ? "Em atraso" : "Em aberto"}
                      </span>
                    </span>

                    {podeMarcar ? (
                      <button
                        type="button"
                        onClick={() => alternar(p)}
                        disabled={ocupado !== null}
                        className="ml-3 text-sm text-muted-foreground underline-offset-4 hover:underline hover:text-foreground disabled:opacity-50"
                      >
                        {ocupado === p.id ? "…" : paga ? "desfazer" : "marcar paga"}
                      </button>
                    ) : null}
                  </td>

                  {podeMarcar ? (
                    <td className="px-4 py-2.5 text-sm whitespace-nowrap">
                      {p.asaas_link ? (
                        <a
                          href={p.asaas_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-foreground underline-offset-4 hover:underline"
                        >
                          ver no Asaas
                        </a>
                      ) : null}
                      {p.asaas_link && p.cobranca_erro ? (
                        // Alerta vindo do Asaas (estorno, cobrança apagada…).
                        <span title={p.cobranca_erro} className="ml-2 cursor-help font-medium text-destructive">
                          atenção
                        </span>
                      ) : p.asaas_link ? null : paga ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => cobrar(p)}
                            disabled={ocupado !== null}
                            className="text-muted-foreground underline-offset-4 hover:underline hover:text-foreground disabled:opacity-50"
                          >
                            {ocupado === p.id ? "gerando…" : "gerar cobrança"}
                          </button>
                          {p.cobranca_erro ? (
                            <span title={p.cobranca_erro} className="cursor-help text-destructive">
                              aviso
                            </span>
                          ) : null}
                        </span>
                      )}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
