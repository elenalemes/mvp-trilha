"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ehAdmin, getSessao } from "@/lib/sessao";
import { enviarMensagem } from "@/lib/avisos";

/**
 * O sino e a tela de Avisos. Tudo só da Trilha, conferido aqui antes de
 * qualquer coisa.
 *
 * LEITURA pela sessão (as regras do banco já limitam ao admin); ESCRITA pela
 * chave de servidor, depois da conferência — ninguém escreve nessas tabelas
 * pela sessão.
 */

export type AvisoDoSino = {
  id: string;
  titulo: string;
  texto: string | null;
  gravidade: "info" | "atencao" | "problema";
  link: string | null;
  created_at: string;
  lido: boolean;
};

export type ResumoSino = { naoLidos: number; recentes: AvisoDoSino[] };

/** Até onde o sino olha. Aviso mais antigo que isso não conta como novo. */
const JANELA = 100;

export async function resumoDoSino(): Promise<ResumoSino | null> {
  const sessao = await getSessao();
  if (!ehAdmin(sessao)) return null;

  const supabase = await createClient();
  const { data: avisos } = await supabase
    .from("aviso")
    .select("id, titulo, texto, gravidade, link, created_at")
    .order("created_at", { ascending: false })
    .limit(JANELA)
    .returns<Omit<AvisoDoSino, "lido">[]>();

  const lista = avisos ?? [];
  if (lista.length === 0) return { naoLidos: 0, recentes: [] };

  const { data: lidos } = await supabase
    .from("aviso_lido")
    .select("aviso_id")
    .eq("conta_id", sessao!.usuarioId)
    .in(
      "aviso_id",
      lista.map((a) => a.id),
    );

  const jaLidos = new Set((lidos ?? []).map((l: { aviso_id: string }) => l.aviso_id));
  const comLeitura = lista.map((a) => ({ ...a, lido: jaLidos.has(a.id) }));

  return {
    naoLidos: comLeitura.filter((a) => !a.lido).length,
    recentes: comLeitura.slice(0, 8),
  };
}

/** Sem ids: marca como lido tudo o que o sino mostra. */
export async function marcarAvisosLidos(ids?: string[]): Promise<void> {
  const sessao = await getSessao();
  if (!ehAdmin(sessao)) return;

  const admin = createAdminClient();
  let alvo = ids;
  if (!alvo) {
    const { data } = await admin.from("aviso").select("id").order("created_at", { ascending: false }).limit(JANELA);
    alvo = (data ?? []).map((a: { id: string }) => a.id);
  }
  if (alvo.length === 0) return;

  await admin
    .from("aviso_lido")
    .upsert(
      alvo.map((aviso_id) => ({ aviso_id, conta_id: sessao!.usuarioId })),
      { onConflict: "aviso_id,conta_id", ignoreDuplicates: true },
    );

  revalidatePath("/avisos");
}

export type ResultadoReenvio = { ok: true; mensagem: string } | { ok: false; erro: string };

/** Botão "reenviar" de uma mensagem que falhou. */
export async function reenviarMensagem(id: string): Promise<ResultadoReenvio> {
  if (!ehAdmin(await getSessao())) return { ok: false, erro: "Só a Trilha reenvia mensagens." };

  const r = await enviarMensagem(createAdminClient(), id, { manual: true });
  revalidatePath("/avisos");
  return r.ok ? { ok: true, mensagem: "Mensagem enviada." } : { ok: false, erro: r.erro ?? "Não saiu." };
}
