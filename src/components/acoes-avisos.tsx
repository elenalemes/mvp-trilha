"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { marcarAvisosLidos, reenviarMensagem } from "@/app/actions/avisos";
import { Button } from "@/components/ui";

export function MarcarTodosLidos() {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  return (
    <Button
      variant="ghost"
      disabled={ocupado}
      onClick={async () => {
        setOcupado(true);
        await marcarAvisosLidos();
        setOcupado(false);
        router.refresh();
      }}
    >
      {ocupado ? "Marcando…" : "Marcar todos como lidos"}
    </Button>
  );
}

export function Reenviar({ id }: { id: string }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  return (
    <span className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={ocupado}
        onClick={async () => {
          setOcupado(true);
          setMsg(null);
          const r = await reenviarMensagem(id);
          setOcupado(false);
          setMsg(r.ok ? { ok: true, texto: r.mensagem } : { ok: false, texto: r.erro });
          router.refresh();
        }}
        className="text-sm font-medium text-foreground underline-offset-4 hover:underline disabled:opacity-50"
      >
        {ocupado ? "enviando…" : "reenviar"}
      </button>
      {msg ? <span className={msg.ok ? "text-xs text-sucesso" : "text-xs text-destructive"}>{msg.texto}</span> : null}
    </span>
  );
}
