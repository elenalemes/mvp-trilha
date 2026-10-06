import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Os avisos do Asaas: `POST /api/asaas/webhook`.
 *
 * Rota PÚBLICA (o Asaas não tem sessão), então a única porta é o token
 * secreto: ele é cadastrado no Asaas junto com a URL e vem em todo aviso no
 * cabeçalho `asaas-access-token`. Sem ele, ou diferente, nada é lido.
 *
 * Toda a regra mora no banco (`asaas_processar_evento`, Parte 3): gravar,
 * ignorar repetido, dar baixa — numa transação só. Aqui é só a porta.
 *
 * Respostas, e por quê:
 *   401  token errado            o Asaas não deve insistir num endereço errado
 *   400  corpo que não é JSON    idem
 *   500  banco fora do ar        o aviso NÃO foi gravado: o Asaas reenvia
 *   200  todo o resto            inclusive erro de processamento — o aviso já
 *                                está gravado com o motivo, e responder erro
 *                                faria o Asaas reenviar em loop até pausar a
 *                                fila (15 falhas seguidas).
 */
export const dynamic = "force-dynamic";

function tokenConfere(recebido: string | null): boolean {
  const esperado = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!esperado || !recebido) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  if (!process.env.ASAAS_WEBHOOK_TOKEN) {
    console.error("[asaas] ASAAS_WEBHOOK_TOKEN não configurado: aviso recusado.");
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  if (!tokenConfere(request.headers.get("asaas-access-token"))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let evento: unknown;
  try {
    evento = await request.json();
  } catch {
    return NextResponse.json({ ok: false, erro: "corpo inválido" }, { status: 400 });
  }

  const { data, error } = await createAdminClient().rpc("asaas_processar_evento", {
    p_evento: evento,
  });

  if (error) {
    console.error("[asaas] aviso não gravado:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  if (data === "erro") {
    console.error("[asaas] aviso gravado com erro de processamento:", (evento as { id?: string })?.id);
  }

  return NextResponse.json({ ok: true, resultado: data });
}
