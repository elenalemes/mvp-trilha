"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { reenviarConvite } from "@/app/actions/convite";
import { Alert, Button } from "@/components/ui";

/**
 * O convite em aberto, na mão de quem pode resolvê-lo.
 *
 * O link fica visível de propósito: se o WhatsApp não chegou — número errado,
 * instância fora do ar — a Trilha copia e manda por onde conseguir. Sem isso,
 * uma falha de envio deixa o corretor com cadastro e sem caminho, e ninguém
 * fica sabendo.
 */
export default function ReenviarConvite({
  parceiroId,
  link,
  enviadoEm,
  expiraEm,
}: {
  parceiroId: string;
  link: string;
  enviadoEm: string | null;
  expiraEm: string | null;
}) {
  const router = useRouter();
  const [copiado, setCopiado] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; ok: boolean } | null>(null);
  const [enviando, setEnviando] = useState(false);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setAviso({ texto: "Não consegui copiar. Selecione o link à mão.", ok: false });
    }
  };

  const reenviar = async () => {
    setEnviando(true);
    setAviso(null);
    const r = await reenviarConvite(parceiroId);
    setEnviando(false);

    setAviso(
      r.ok
        ? { texto: "Convite novo enviado no WhatsApp.", ok: true }
        : { texto: r.erro, ok: false },
    );
    router.refresh();
  };

  const vencido = expiraEm ? new Date(expiraEm) < new Date() : false;

  return (
    <section className="mb-6 rounded-lg border border-border bg-white p-6">
      <h2 className="text-sm font-semibold text-muted-foreground">
        Convite de primeiro acesso
      </h2>

      <p className="mt-3 text-[15px] text-foreground">
        {enviadoEm
          ? `Enviado no WhatsApp em ${new Date(enviadoEm).toLocaleString("pt-BR")}.`
          : "O envio pelo WhatsApp não foi confirmado."}{" "}
        {vencido ? (
          <strong className="text-red-700">O link venceu — reenvie para gerar um novo.</strong>
        ) : expiraEm ? (
          <span className="text-muted-foreground">
            Vale até {new Date(expiraEm).toLocaleDateString("pt-BR")}.
          </span>
        ) : null}
      </p>

      <code className="mt-3 block overflow-x-auto rounded bg-muted/50 px-3 py-2 font-mono text-xs break-all text-foreground">
        {link}
      </code>

      {aviso ? (
        <div className="mt-4">
          <Alert tone={aviso.ok ? "ok" : "erro"}>{aviso.texto}</Alert>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-3">
        <Button type="button" onClick={reenviar} disabled={enviando}>
          {enviando ? "Enviando…" : "Reenviar no WhatsApp"}
        </Button>
        <Button type="button" variant="ghost" onClick={copiar}>
          {copiado ? "Link copiado!" : "Copiar link"}
        </Button>
      </div>
    </section>
  );
}
