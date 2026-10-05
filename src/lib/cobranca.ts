/**
 * Cobrar uma parcela no Asaas — a regra, sem a porta.
 *
 * Fica FORA de `app/actions` de propósito: lá, toda função exportada vira
 * endpoint público. Esta não confere quem chama (quem chama confere: o botão
 * confere a sessão de admin; a rotina diária, o segredo dela), então não pode
 * ser chamável de fora.
 *
 * As travas, na ordem em que aparecem:
 *   1. parcela paga não se cobra;
 *   2. parcela já cobrada devolve a mesma cobrança (nunca duas);
 *   3. parcela sem divisão não se cobra — sem divisão não há repasse certo;
 *   4. na conta REAL do Asaas, só trilha liberada (`cobranca_automatica`);
 *   5. vencimento no passado: o Asaas recusa, e a tela diz o que fazer.
 */

import type { createAdminClient } from "@/lib/supabase/admin";
import { ErroAsaas, garantirCliente, garantirCobranca, type AmbienteAsaas } from "@/lib/asaas";

export type ResultadoCobranca = { ok: true; link: string | null } | { ok: false; erro: string };

type Admin = ReturnType<typeof createAdminClient>;

type LinhaParcela = {
  id: string;
  numero: number;
  vencimento: string;
  valor: number;
  status: "aberta" | "paga";
  asaas_cobranca_id: string | null;
  asaas_link: string | null;
  valor_vendedor: number | null;
  negocio: {
    id: string;
    status: string;
    cobranca_automatica: boolean;
    proposta: { prazo_meses: number } | null;
    imovel: { identificacao: string } | null;
    empreendimento: { nome: string } | null;
    comprador: {
      id: string;
      nome: string;
      cpf: string;
      email: string;
      telefone: string;
      asaas_cliente_id: string | null;
    } | null;
  } | null;
};

type ConfigFinanceiro = {
  asaas_ambiente: AmbienteAsaas;
  multa_percentual: number;
  juros_mensal: number;
};

const hojeSP = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

/**
 * O coração: cobrar uma parcela. Não confere QUEM pediu — quem chama já
 * conferiu (o botão confere a sessão; a rotina diária, o segredo dela).
 */
export async function cobrarParcela(admin: Admin, parcelaId: string): Promise<ResultadoCobranca> {
  const { data: cfg, error: erroCfg } = await admin
    .from("config_financeiro")
    .select("asaas_ambiente, multa_percentual, juros_mensal")
    .maybeSingle<ConfigFinanceiro>();

  if (erroCfg || !cfg) {
    return { ok: false, erro: "As regras do financeiro não foram encontradas. A Parte 1 (SQL) foi aplicada?" };
  }

  const { data: p } = await admin
    .from("parcela")
    .select(
      `id, numero, vencimento, valor, status, asaas_cobranca_id, asaas_link, valor_vendedor,
       negocio (id, status, cobranca_automatica,
                proposta (prazo_meses),
                imovel (identificacao),
                empreendimento (nome),
                comprador (id, nome, cpf, email, telefone, asaas_cliente_id))`,
    )
    .eq("id", parcelaId)
    .maybeSingle<LinhaParcela>();

  if (!p || !p.negocio) return { ok: false, erro: "Parcela não encontrada." };
  const n = p.negocio;

  if (p.status === "paga") return { ok: false, erro: "Esta parcela já está paga." };
  if (p.asaas_cobranca_id) return { ok: true, link: p.asaas_link };

  if (p.valor_vendedor === null) {
    return { ok: false, erro: "Esta parcela ainda não tem a divisão entre vendedor e corretores. Nada foi cobrado." };
  }
  if (n.status !== "em_jornada") {
    return { ok: false, erro: "Só se cobra parcela de trilha em andamento." };
  }
  if (cfg.asaas_ambiente === "producao" && !n.cobranca_automatica) {
    return {
      ok: false,
      erro: "Esta trilha não está liberada para cobrança na conta real do Asaas. Libere-a antes, no quadro de cobrança.",
    };
  }
  if (p.vencimento < hojeSP()) {
    return {
      ok: false,
      erro: "O vencimento desta parcela já passou, e o Asaas não aceita cobrança com data no passado. Ajuste o primeiro vencimento da trilha ou marque a parcela como paga, se ela foi paga por fora.",
    };
  }
  if (!n.comprador) return { ok: false, erro: "A trilha não tem comprador vinculado." };

  const marcarErro = async (erro: string) => {
    await admin.from("parcela").update({ cobranca_erro: erro }).eq("id", p.id);
  };

  try {
    let clienteId = n.comprador.asaas_cliente_id;
    if (!clienteId) {
      clienteId = await garantirCliente(cfg.asaas_ambiente, {
        compradorId: n.comprador.id,
        nome: n.comprador.nome,
        cpf: n.comprador.cpf,
        email: n.comprador.email,
        telefone: n.comprador.telefone,
      });
      await admin.from("comprador").update({ asaas_cliente_id: clienteId }).eq("id", n.comprador.id);
    }

    const prazo = n.proposta?.prazo_meses;
    const { cobranca } = await garantirCobranca(cfg.asaas_ambiente, {
      clienteId,
      parcelaId: p.id,
      valor: Number(p.valor),
      vencimento: p.vencimento,
      descricao: `Trilha · ${n.imovel?.identificacao ?? "unidade"} · ${n.empreendimento?.nome ?? ""} · parcela ${p.numero}${prazo ? `/${prazo}` : ""}`,
      multaPercentual: Number(cfg.multa_percentual),
      jurosMensal: Number(cfg.juros_mensal),
    });

    const { error } = await admin
      .from("parcela")
      .update({
        asaas_cobranca_id: cobranca.id,
        asaas_status: cobranca.status,
        asaas_link: cobranca.invoiceUrl,
        cobranca_gerada_em: new Date().toISOString(),
        cobranca_erro: null,
      })
      .eq("id", p.id)
      // Só grava se ninguém gravou antes (dois cliques ao mesmo tempo).
      .is("asaas_cobranca_id", null);

    if (error) {
      console.error("[cobranca] criada no Asaas mas não gravada:", p.id, cobranca.id, error);
      return {
        ok: false,
        erro: `A cobrança foi criada no Asaas (${cobranca.id}), mas não consegui registrar aqui. Clique de novo: o sistema reencontra a mesma cobrança, sem duplicar.`,
      };
    }

    return { ok: true, link: cobranca.invoiceUrl };
  } catch (e) {
    const msg = e instanceof ErroAsaas ? e.message : "Erro inesperado ao falar com o Asaas.";
    if (!(e instanceof ErroAsaas)) console.error("[cobranca] erro inesperado:", e);
    await marcarErro(msg);
    return { ok: false, erro: msg };
  }
}
