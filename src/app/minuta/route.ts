import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessao } from "@/lib/sessao";

/**
 * A minuta do contrato: `GET /minuta?t=<token do negócio>`.
 *
 * O arquivo mora numa pasta PRIVADA do Storage (`documentos`), porque traz
 * dados da Trilha e do representante. Esta rota é a única porta, e abre para:
 *
 *   - quem tem o link de um negócio vivo (o mesmo token do acompanhamento do
 *     comprador — é o link que vai no WhatsApp para todas as partes);
 *   - quem está logado no painel.
 *
 * Passou: devolve um link temporário (5 minutos) para o PDF. O link que
 * circula no WhatsApp nunca é o do arquivo, é sempre este.
 *
 * Para trocar a minuta: subir o PDF novo com o MESMO nome no Storage.
 */
export const dynamic = "force-dynamic";

const BUCKET = "documentos";
const ARQUIVO = "minuta-contrato.pdf";

function pagina(titulo: string, texto: string, status: number) {
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${titulo} · Trilha</title></head><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;color:#1f2937"><h1 style="font-size:1.25rem">${titulo}</h1><p style="color:#6b7280;line-height:1.5">${texto}</p></body></html>`;
  return new NextResponse(html, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

export async function GET(request: NextRequest) {
  const admin = createAdminClient();
  const token = request.nextUrl.searchParams.get("t");

  let liberado = false;
  if (token && /^[a-f0-9]{16,64}$/i.test(token)) {
    const { data } = await admin
      .from("negocio")
      .select("status")
      .eq("token", token)
      .maybeSingle<{ status: string }>();
    liberado = Boolean(data && data.status !== "cancelado");
  }
  if (!liberado) liberado = Boolean(await getSessao());

  if (!liberado) {
    return pagina(
      "Link inválido",
      "Confira se o link veio inteiro na mensagem. Se o problema continuar, fale com quem está te atendendo.",
      404,
    );
  }

  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(ARQUIVO, 300);
  if (error || !data?.signedUrl) {
    console.error("[minuta] arquivo indisponível:", error?.message);
    return pagina("Minuta indisponível", "A minuta ainda não foi publicada. Fale com a Trilha.", 503);
  }

  return NextResponse.redirect(data.signedUrl, 302);
}
