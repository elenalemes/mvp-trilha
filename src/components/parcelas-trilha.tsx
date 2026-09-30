"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { marcarPaga, desmarcarPaga } from "@/app/actions/parcelas";
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
 * Só a Trilha vê o controle de marcar. Os outros leem — para a incorporadora
 * isto é a liquidez dela, para o corretor é a comissão.
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

  return (
    <div className="flex flex-col gap-3">
      {erro ? <Alert>{erro}</Alert> : null}

      <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
        <table className="w-full min-w-[520px] border-collapse text-left">
          <thead>
            <tr className="border-b border-border">
              {["Parcela", "Vencimento", "Valor", "Situação"].map((h) => (
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
                    {p.numero}
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
