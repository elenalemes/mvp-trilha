import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { BUCKET_FECHAMENTO } from "@/lib/armazenamento";

/**
 * Abrir um arquivo do fechamento: `/arquivos/<id>`.
 *
 * O link na tela é sempre este, e não o do Storage. A cada clique a permissão
 * é conferida de novo e sai um link assinado que vale 60 segundos — o
 * suficiente para o navegador abrir, curto demais para ser repassado. O link
 * da tela, por sua vez, nunca expira: a página pode ficar aberta o dia todo.
 *
 * `?baixar` devolve o arquivo com o nome original, para salvar em vez de abrir.
 *
 * A rota não é pública: sem sessão, o proxy manda para o login.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  // A policy da tabela é a mesma do bucket: se a linha não volta, o arquivo
  // não é para esta pessoa — ou não existe. As duas respostas são iguais de
  // propósito, para não confirmar a existência de um documento alheio.
  const { data } = await supabase
    .from("checklist_arquivo")
    .select("caminho, nome_original")
    .eq("id", id)
    .maybeSingle<{ caminho: string; nome_original: string }>();

  if (!data) {
    return new NextResponse("Arquivo não encontrado ou sem permissão para abrir.", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const baixar = request.nextUrl.searchParams.has("baixar");

  const { data: assinado, error } = await supabase.storage
    .from(BUCKET_FECHAMENTO)
    .createSignedUrl(data.caminho, 60, baixar ? { download: data.nome_original } : undefined);

  if (error || !assinado) {
    console.error("[arquivos] link assinado recusado:", data.caminho, error);
    return new NextResponse("Não consegui abrir o arquivo agora. Tente de novo.", {
      status: 502,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  return NextResponse.redirect(assinado.signedUrl);
}
