"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cancelarNegocio } from "@/app/actions/fechamento";
import { Alert, Button, Textarea } from "@/components/ui";

/**
 * Cancelar o negócio.
 *
 * Recolhido atrás de um clique e no fim da tela: é a ação mais pesada daqui, e
 * quem abre este fechamento no dia a dia vem trabalhar nas tarefas, não
 * cancelar.
 *
 * As duas escolhas de destino da unidade estão em botões separados, e não num
 * seletor com um padrão: "volta a vender" e "sai do estoque" são decisões
 * diferentes, e um padrão escolhido por preguiça devolveria ao simulador uma
 * unidade que a incorporadora acabou de retirar.
 */
export default function CancelarNegocio({
  negocioId,
  unidade,
}: {
  negocioId: string;
  unidade: string;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const cancelar = async (destino: "disponivel" | "indisponivel") => {
    setEnviando(true);
    setErro(null);

    const r = await cancelarNegocio(negocioId, motivo, destino);

    setEnviando(false);
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    setAberto(false);
    router.refresh();
  };

  if (!aberto) {
    return (
      <div className="mt-10 border-t border-trilha-100 pt-6">
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="font-display text-sm font-semibold tracking-wide text-red-700 uppercase underline underline-offset-2 hover:text-red-800"
        >
          Cancelar este negócio
        </button>
      </div>
    );
  }

  return (
    <section className="mt-10 rounded-lg border border-red-200 bg-red-50/50 p-6">
      <h2 className="font-display text-xl font-semibold text-red-800">Cancelar o negócio</h2>

      <p className="mt-2 text-[15px] text-red-800">
        Nada é apagado: a proposta, o negócio e as tarefas continuam no sistema, marcados como
        cancelados, com o motivo e a data. É assim que daqui a três meses ainda dá para responder o
        que aconteceu com a <strong>{unidade}</strong>.
      </p>

      <label className="mt-5 flex flex-col gap-1.5">
        <span className="font-display text-sm font-semibold tracking-wide text-red-800 uppercase">
          Por que está caindo?
        </span>
        <Textarea
          rows={3}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Crédito reprovado, comprador desistiu, incorporadora retirou a unidade…"
        />
        <span className="text-xs text-red-700">
          O corretor vê este texto na proposta dele. Obrigatório.
        </span>
      </label>

      {erro ? (
        <div className="mt-4">
          <Alert>{erro}</Alert>
        </div>
      ) : null}

      <p className="font-display mt-6 text-sm font-semibold tracking-wide text-red-800 uppercase">
        E a unidade, o que acontece com ela?
      </p>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => cancelar("disponivel")}
          disabled={enviando}
          className="font-display flex-1 rounded-md border border-red-300 bg-white px-5 py-3 text-left text-[15px] font-semibold text-red-800 transition-colors hover:bg-red-50 disabled:opacity-50"
        >
          Volta a ficar disponível
          <span className="font-body mt-0.5 block text-sm font-normal text-red-700">
            O negócio caiu, mas a unidade continua à venda e volta ao simulador.
          </span>
        </button>

        <button
          type="button"
          onClick={() => cancelar("indisponivel")}
          disabled={enviando}
          className="font-display flex-1 rounded-md border border-red-300 bg-white px-5 py-3 text-left text-[15px] font-semibold text-red-800 transition-colors hover:bg-red-50 disabled:opacity-50"
        >
          Sai do estoque
          <span className="font-body mt-0.5 block text-sm font-normal text-red-700">
            A unidade não é mais para vender. Some do simulador e do painel do corretor.
          </span>
        </button>
      </div>

      <div className="mt-4">
        <Button type="button" variant="ghost" onClick={() => setAberto(false)} disabled={enviando}>
          {enviando ? "Cancelando…" : "Voltar"}
        </Button>
      </div>
    </section>
  );
}
