import { headers } from "next/headers";

/**
 * O endereço do sistema, visto de dentro de uma requisição.
 *
 * Tudo que o sistema manda para fora — convite do corretor, acompanhamento do
 * comprador, aviso de proposta aceita — precisa de um link absoluto, e nenhum
 * desses lugares deveria saber em que domínio a aplicação está rodando.
 *
 * A origem sai dos cabeçalhos em vez de uma variável de ambiente: assim vale
 * em `localhost`, no domínio da Vercel e num domínio próprio depois, sem
 * ninguém lembrar de configurar nada.
 *
 * `SITE_URL` existe só para o desenvolvimento: rodando local, o link sairia
 * como `http://localhost:3000/...`, que não abre no celular de ninguém.
 * Apontando para o domínio publicado — que usa o MESMO Supabase — a mensagem
 * enviada num teste local funciona de verdade. Em produção não se define a
 * variável.
 */
export async function linkDoSite(caminho: string): Promise<string> {
  const base = process.env.SITE_URL?.trim().replace(/\/$/, "");
  const rota = caminho.startsWith("/") ? caminho : `/${caminho}`;

  if (base) return `${base}${rota}`;

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const protocolo = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

  return `${protocolo}://${host}${rota}`;
}
