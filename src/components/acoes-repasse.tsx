"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { confirmarQueNaoSaiu, gerarRepassesAgora, tentarRepasseDeNovo } from "@/app/actions/repasses";
import { Alert, Button } from "@/components/ui";

type Acao = () => Promise<{ ok: true; mensagem: string } | { ok: false; erro: string }>;

function useAcao() {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<{ tom: "ok" | "erro"; texto: string } | null>(null);

  const executar = async (acao: Acao) => {
    setOcupado(true);
    setMsg(null);
    const r = await acao();
    setOcupado(false);
    setMsg(r.ok ? { tom: "ok", texto: r.mensagem } : { tom: "erro", texto: r.erro });
    router.refresh();
  };

  return { ocupado, msg, executar };
}

/** Botão do topo: gerar e enviar agora os repasses prontos, fora do dia 14. */
export function GerarRepassesAgora({ quantos }: { quantos: number }) {
  const { ocupado, msg, executar } = useAcao();
  const [confirmando, setConfirmando] = useState(false);

  return (
    <div className="flex flex-col items-end gap-2">
      {confirmando ? (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Enviar {quantos} repasse(s) ao Asaas agora?</span>
          <Button
            disabled={ocupado}
            onClick={() => {
              setConfirmando(false);
              executar(gerarRepassesAgora);
            }}
          >
            {ocupado ? "Enviando…" : "Sim, enviar"}
          </Button>
          <Button variant="ghost" disabled={ocupado} onClick={() => setConfirmando(false)}>
            Cancelar
          </Button>
        </div>
      ) : (
        <Button disabled={ocupado || quantos === 0} onClick={() => setConfirmando(true)}>
          {ocupado ? "Enviando…" : "Gerar repasses agora"}
        </Button>
      )}
      {msg ? <Alert tone={msg.tom}>{msg.texto}</Alert> : null}
    </div>
  );
}

/** Ações de um lote com problema. */
export function AcoesLote({ loteId, status }: { loteId: string; status: string }) {
  const { ocupado, msg, executar } = useAcao();

  return (
    <div className="flex flex-col gap-2">
      {status === "falhou" ? (
        <button
          type="button"
          disabled={ocupado}
          onClick={() => executar(() => tentarRepasseDeNovo(loteId))}
          className="self-start text-sm font-medium text-foreground underline-offset-4 hover:underline disabled:opacity-50"
        >
          {ocupado ? "enviando…" : "tentar de novo"}
        </button>
      ) : (
        <button
          type="button"
          disabled={ocupado}
          onClick={() => {
            if (window.confirm("Você conferiu no Asaas e esta transferência NÃO existe? Só confirme depois de olhar.")) {
              executar(() => confirmarQueNaoSaiu(loteId));
            }
          }}
          className="self-start text-sm font-medium text-foreground underline-offset-4 hover:underline disabled:opacity-50"
        >
          conferi no Asaas: não saiu
        </button>
      )}
      {msg ? <Alert tone={msg.tom}>{msg.texto}</Alert> : null}
    </div>
  );
}
