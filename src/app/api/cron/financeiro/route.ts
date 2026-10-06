import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rodarCobranca } from "@/lib/rotina-cobranca";

/**
 * As rotinas do financeiro: `GET /api/cron/financeiro`.
 *
 * Quem chama é a Vercel, todo dia às 6h de Brasília (`vercel.json`). Ela manda
 * `Authorization: Bearer <CRON_SECRET>` — o segredo vive só na Vercel. Sem ele,
 * nada roda: a rota é pública (a Vercel não tem sessão), e o segredo é a porta.
 *
 * `?data=AAAA-MM-DD` finge que hoje é outro dia, para TESTAR o dia 1 sem
 * esperar o mês virar. Só vale com o Asaas em modo de teste (sandbox): na
 * conta real, a data é sempre a de hoje.
 *
 * Hoje roda a cobrança. Os repasses (Parte 5) entram aqui também.
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

const hojeSP = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

export async function GET(request: NextRequest) {
  if (!autorizado(request.headers.get("authorization"))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const admin = createAdminClient();
  let hoje = hojeSP();

  const simulada = request.nextUrl.searchParams.get("data");
  if (simulada) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(simulada)) {
      return NextResponse.json({ ok: false, erro: "data inválida (use AAAA-MM-DD)" }, { status: 400 });
    }
    const { data: cfg } = await admin
      .from("config_financeiro")
      .select("asaas_ambiente")
      .maybeSingle<{ asaas_ambiente: string }>();
    if (cfg?.asaas_ambiente !== "sandbox") {
      return NextResponse.json(
        { ok: false, erro: "simular data só é permitido com o Asaas em modo de teste" },
        { status: 400 },
      );
    }
    hoje = simulada;
  }

  try {
    const cobranca = await rodarCobranca(admin, hoje);
    return NextResponse.json({ ok: true, cobranca });
  } catch (e) {
    console.error("[rotina] falha inesperada:", e);
    return NextResponse.json({ ok: false, erro: "falha inesperada na rotina" }, { status: 500 });
  }
}
