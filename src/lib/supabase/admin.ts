import { createClient } from "@supabase/supabase-js";

/**
 * Cliente administrativo do Supabase.
 *
 * Usa a chave `service_role`, que IGNORA todas as regras de acesso (RLS).
 * Só pode ser usado dentro de server actions, nunca no navegador — por isso
 * a variável de ambiente não tem o prefixo NEXT_PUBLIC_.
 *
 * É o que permite o admin da Trilha criar o login de uma incorporadora.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY não configurada. Adicione a chave service_role no .env.local.",
    );
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
