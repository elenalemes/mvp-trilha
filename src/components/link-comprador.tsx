"use client";

import { useState } from "react";
import { Check, Link as LinkIcon, MessageCircle } from "lucide-react";
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
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-sm font-semibold text-foreground">Link do comprador</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          Mostra a etapa e com quem ela está. Não mostra documento nem análise.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Button type="button" onClick={whatsapp} className="w-full">
          <MessageCircle aria-hidden="true" />
          Enviar no WhatsApp
        </Button>
        <Button type="button" variant="ghost" onClick={copiar} className="w-full">
          {copiado ? <Check aria-hidden="true" /> : <LinkIcon aria-hidden="true" />}
          {copiado ? "Link copiado" : "Copiar link"}
        </Button>
      </div>
    </div>
  );
}
