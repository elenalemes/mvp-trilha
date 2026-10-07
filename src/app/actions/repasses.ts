"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { ehAdmin, getSessao } from "@/lib/sessao";
import { enviarLote } from "@/lib/repasse";
import { rodarRepasse } from "@/lib/rotina-repasse";
import type { AmbienteAsaas } from "@/lib/asaas";

/**
 * Os botões da tela de Repasses. Todos só da Trilha, conferido aqui, antes de
 * qualquer coisa — a escrita vai pela chave de servidor.
 */

export type Resultado = { ok: true; mensagem: string } | { ok: false; erro: string };

async function exigirAdmin(): Promise<string | null> {
  return ehAdmin(await getSessao()) ? null : "Só a Trilha opera repasses.";
}

async function config(admin: ReturnType<typeof createAdminClient>) {
  const { data } = await admin
    .from("config_financeiro")
    .select("asaas_ambiente, repasse_ligado")
    .maybeSingle<{ asaas_ambiente: AmbienteAsaas; repasse_ligado: boolean }>();
  return data;
}

const hojeSP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

/** Lote que falhou (chave corrigida, saldo reposto…): tentar de novo agora. */
export async function tentarRepasseDeNovo(loteId: string): Promise<Resultado> {
  const recusa = await exigirAdmin();
  if (recusa) return { ok: false, erro: recusa };

  const admin = createAdminClient();
  const cfg = await config(admin);
  if (!cfg?.repasse_ligado) return { ok: false, erro: "Os repasses estão desligados na configuração do financeiro." };

  const r = await enviarLote(admin, loteId, cfg.asaas_ambiente);
  revalidatePath("/repasses");
  return r.ok
    ? { ok: true, mensagem: `Pix de ${r.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} para ${r.nome} enviado. Aprove no Asaas.` }
    : { ok: false, erro: r.erro };
}

/**
 * Lote em "verificar": alguém conferiu no Asaas e a transferência NÃO existe.
 * Volta para "falhou", e aí o "tentar de novo" aparece. Quem confirma assume a
 * conferência — por isso é um passo separado, e não um "reenviar" direto.
 */
export async function confirmarQueNaoSaiu(loteId: string): Promise<Resultado> {
  const recusa = await exigirAdmin();
  if (recusa) return { ok: false, erro: recusa };

  const sessao = await getSessao();
  const { data, error } = await createAdminClient()
    .from("repasse_lote")
    .update({
      status: "falhou",
      erro: `Conferido no Asaas por ${sessao?.conta?.nome ?? "admin"} em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}: a transferência não existe.`,
    })
    .eq("id", loteId)
    .in("status", ["verificar", "enviando"])
    .select("id")
    .maybeSingle<{ id: string }>();

  revalidatePath("/repasses");
  if (error || !data) return { ok: false, erro: "Este lote não está aguardando verificação." };
  return { ok: true, mensagem: "Registrado. Agora o lote pode ser enviado de novo." };
}

/** Gera e envia os repasses prontos agora, fora da janela do dia 14. */
export async function gerarRepassesAgora(): Promise<Resultado> {
  const recusa = await exigirAdmin();
  if (recusa) return { ok: false, erro: recusa };

  const admin = createAdminClient();
  const cfg = await config(admin);
  if (!cfg?.repasse_ligado) return { ok: false, erro: "Os repasses estão desligados na configuração do financeiro." };

  const r = await rodarRepasse(admin, hojeSP(), { forcar: true });
  revalidatePath("/repasses");

  const total = r.enviados.reduce((s, e) => s + e.valor, 0);
  const partes = [
    r.enviados.length
      ? `${r.enviados.length} Pix enviado(s), ${total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}, aguardando aprovação no Asaas.`
      : "Nenhum repasse pronto para enviar.",
  ];
  if (r.problemas.length) partes.push(`${r.problemas.length} com problema — veja a aba "Com problema".`);
  return { ok: true, mensagem: partes.join(" ") };
}
