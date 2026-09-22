"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

/**
 * O link de acompanhamento do comprador, na mão de quem fala com ele.
 *
 * Montado no navegador pelo mesmo motivo do botão do simulador: a origem
 * (`localhost`, Vercel, domínio próprio depois) só existe aqui. WhatsApp
 * primeiro porque é por onde o corretor conversa com o cliente.
 */
export default function LinkComprador({
  token,
  unidade,
  empreendimento,
}: {
  token: string;
  unidade: string;
  empreendimento: string;
}) {
  const [copiado, setCopiado] = useState(false);

  const link = () => `${window.location.origin}/acompanhar?t=${token}`;

  const whatsapp = () => {
    const texto = [
      `Acompanhe a sua compra — ${unidade} · ${empreendimento}`,
      "",
      "Neste link você vê em que pé está o processo, a qualquer hora:",
      link(),
      "",
      "Guarde o link: ele é seu e vale até a entrega das chaves.",
    ].join("\n");

    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(link());
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      window.open(link(), "_blank", "noopener");
    }
  };

  return (
    <section className="mt-10 rounded-lg border border-trilha-200 bg-white p-6">
      <h2 className="font-display text-sm font-semibold tracking-[0.12em] text-trilha-400 uppercase">
        Acompanhamento do comprador
      </h2>

      <p className="mt-3 text-[15px] text-trilha-700">
        Um link só dele, permanente, que mostra em que etapa o processo está e com quem. Não mostra
        tarefa, documento nem resultado de análise.
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        <Button type="button" onClick={whatsapp}>
          Enviar no WhatsApp
        </Button>
        <Button type="button" variant="ghost" onClick={copiar}>
          {copiado ? "Link copiado!" : "Copiar link"}
        </Button>
      </div>
    </section>
  );
}
