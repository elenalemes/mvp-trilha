import { createAdminClient } from "@/lib/supabase/admin";
import { estaFechada, etapas, nivelAberto, progresso, type Ator, type Tarefa } from "@/lib/fechamento";

/**
 * O acompanhamento do comprador.
 *
 * Terceira e última porta pública do sistema, ao lado de `lib/simulador.ts` e
 * de `actions/propostas.ts`: quem abre não tem sessão, então a leitura vai
 * pela chave de servidor, com forma FIXA e o token como única entrada.
 *
 * DUAS REGRAS QUE ESTA FUNÇÃO PRECISA GARANTIR, e que não podem depender da
 * tela lembrar delas:
 *
 *   1. Tarefa marcada como `interna` não sai daqui. Hoje isso é a verificação
 *      de crédito — reprovação de comprador não se conta por página web, se
 *      conta por uma pessoa ligando. Se a etapa inteira for interna, ela some
 *      junto.
 *
 *   2. O motivo do cancelamento não sai daqui. Ele costuma ser exatamente o
 *      que não se quer dizer por texto ("crédito reprovado").
 */

export type EtapaPublica = {
  nome: string;
  responsaveis: Ator[];
  feitas: number;
  total: number;
  situacao: "concluida" | "andamento" | "aguardando";
};

export type Acompanhamento = {
  unidade: string;
  empreendimento: string;
  incorporadora: string;
  cancelado: boolean;
  /** Resumo do que foi combinado, para quem quer conferir sem procurar papel. */
  condicao: { prazoMeses: number; parcela: number; ato: number; saldo: number } | null;
  etapas: EtapaPublica[];
  progresso: number;
};

type LinhaNegocio = {
  id: string;
  status: string;
  imovel: { identificacao: string } | null;
  empreendimento: { nome: string } | null;
  incorporadora: { nome: string } | null;
  proposta: {
    prazo_meses: number;
    valor_parcela: number;
    valor_ato: number;
    valor_saldo: number;
  } | null;
};

export async function lerAcompanhamento(token: string): Promise<Acompanhamento | null> {
  const supabase = createAdminClient();

  const { data: negocio } = await supabase
    .from("negocio")
    .select(
      `id, status,
       imovel (identificacao),
       empreendimento (nome),
       incorporadora (nome),
       proposta (prazo_meses, valor_parcela, valor_ato, valor_saldo)`,
    )
    .eq("token", token)
    .maybeSingle<LinhaNegocio>();

  if (!negocio) return null;

  const { data } = await supabase
    .from("checklist_item")
    .select("id, etapa, etapa_ordem, ordem, titulo, ator, tipo, exige_validade, interna, status, arquivo_path, referencia_externa, observacao, emitido_em, valido_ate, concluido_em")
    .eq("negocio_id", negocio.id)
    .returns<Tarefa[]>();

  const tarefas = data ?? [];
  const nivel = nivelAberto(tarefas);

  const publicas = etapas(tarefas)
    .map((e) => {
      const visiveis = e.tarefas.filter((t) => !t.interna);
      if (visiveis.length === 0) return null;

      const feitas = visiveis.filter(estaFechada).length;
      const pendentes = visiveis.filter((t) => !estaFechada(t));

      return {
        nome: e.nome,
        responsaveis: [...new Set(pendentes.map((t) => t.ator))],
        feitas,
        total: visiveis.length,
        situacao:
          feitas === visiveis.length
            ? ("concluida" as const)
            : nivel !== null && e.nivel <= nivel
              ? ("andamento" as const)
              : ("aguardando" as const),
      };
    })
    .filter((e): e is EtapaPublica => e !== null);

  return {
    unidade: negocio.imovel?.identificacao ?? "",
    empreendimento: negocio.empreendimento?.nome ?? "",
    incorporadora: negocio.incorporadora?.nome ?? "",
    cancelado: negocio.status === "cancelado",
    condicao: negocio.proposta
      ? {
          prazoMeses: negocio.proposta.prazo_meses,
          parcela: negocio.proposta.valor_parcela,
          ato: negocio.proposta.valor_ato,
          saldo: negocio.proposta.valor_saldo,
        }
      : null,
    etapas: publicas,
    // O andamento conta TODAS as tarefas, inclusive a interna: esconder uma
    // etapa da vista não é motivo para mentir no percentual.
    progresso: progresso(tarefas),
  };
}
