import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { varrerFila } from "@/lib/avisos";

/**
 * A segunda chance das mensagens: `GET /api/cron/mensagens`.
 *
 * Toda mensagem tenta sair na hora em que nasce. O que falhou (uazapi fora do
 * ar, por exemplo) é tentado de novo aqui, uma vez por dia às 10h de Brasília
 * — horário decente para chegar WhatsApp em comprador. Até 3 tentativas no
 * total; depois disso, só pelo botão em Avisos → Mensagens.
 *
 * Mesma porta da rotina do financeiro: `Authorization: Bearer <CRON_SECRET>`.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function autorizado(header: string | null): boolean {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${segredo}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  if (!autorizado(request.headers.get("authorization"))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const inicio = Date.now();
  try {
    const resumo = await varrerFila(createAdminClient(), inicio + 55_000);
    return NextResponse.json({ ok: true, ...resumo });
  } catch (e) {
    console.error("[mensagens] falha inesperada:", e);
    return NextResponse.json({ ok: false, erro: "falha inesperada" }, { status: 500 });
  }
}
