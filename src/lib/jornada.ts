/**
 * Onde a trilha está no tempo.
 *
 * Irmã de `lib/fechamento.ts`: função pura, nada de banco. O fechamento é uma
 * conta sobre tarefas; a jornada é uma conta sobre datas — quando começou,
 * quantos meses já correram, quando o comprador vai ao banco.
 *
 * O FIM NÃO É COLUNA de propósito. Ele é `jornada_inicio` mais o `prazo_meses`
 * congelado na proposta, e guardar o resultado criaria uma segunda verdade que
 * fica errada no dia em que alguém corrigir a data de início. É a mesma regra
 * de `valor_reajustado`: número que é consequência não se digita.
 */

export type Jornada = {
  /** O mês corrente, de 1 até o prazo. No primeiro dia já é mês 1. */
  mes: number;
  prazo: number;
  /** Quando a Trilha acaba. No mês seguinte o comprador quita. */
  fim: Date;
  /** Passou do prazo — está na hora da quitação. */
  venceu: boolean;
};

export function jornada(inicio: string, prazoMeses: number): Jornada {
  const comeco = new Date(inicio);

  const fim = new Date(comeco);
  fim.setMonth(fim.getMonth() + prazoMeses);

  const agora = new Date();

  // Meses de calendário entre as duas datas, descontando o mês em curso quando
  // ainda não chegou no dia. Contar por 30 dias erraria quase um mês ao longo
  // de 24, e o mês 18 é justamente onde o aviso de financiamento vai morar.
  const decorridos =
    (agora.getFullYear() - comeco.getFullYear()) * 12 +
    (agora.getMonth() - comeco.getMonth()) -
    (agora.getDate() < comeco.getDate() ? 1 : 0);

  return {
    mes: Math.min(prazoMeses, Math.max(1, decorridos + 1)),
    prazo: prazoMeses,
    fim,
    venceu: agora >= fim,
  };
}

/** "mês 3 de 24" — o rótulo curto, igual em toda tela que mostra a jornada. */
export function rotuloJornada(j: Jornada): string {
  return j.venceu ? `${j.prazo} de ${j.prazo} · quitação` : `mês ${j.mes} de ${j.prazo}`;
}

export const dataBR = (d: Date | string) =>
  new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

// ------------------------------------------------------------- as parcelas

export type Parcela = {
  id: string;
  numero: number;
  vencimento: string;
  valor: number;
  status: "aberta" | "paga";
  pago_em: string | null;
};

export type ResumoParcelas = {
  pagas: number;
  total: number;
  /** Venceram e continuam abertas. É o número que faz alguém ligar. */
  atrasadas: number;
  /** A próxima a vencer que ainda está aberta. */
  proxima: Parcela | null;
  recebido: number;
  aReceber: number;
};

/** Meia-noite de hoje: comparar com `Date.now()` diria que a parcela de hoje está atrasada. */
function hoje(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * O estado da carteira de um negócio.
 *
 * Função pura, como o resto deste arquivo: o painel da Trilha, a carteira da
 * incorporadora e o extrato do corretor precisam concordar sobre quantas estão
 * em atraso, e a única forma de garantir isso é a conta morar num lugar só.
 */
export function resumoParcelas(parcelas: Parcela[]): ResumoParcelas {
  const limite = hoje();
  const pagas = parcelas.filter((p) => p.status === "paga");
  const abertas = parcelas
    .filter((p) => p.status === "aberta")
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));

  return {
    pagas: pagas.length,
    total: parcelas.length,
    atrasadas: abertas.filter((p) => new Date(`${p.vencimento}T00:00:00`).getTime() < limite).length,
    proxima: abertas[0] ?? null,
    recebido: pagas.reduce((soma, p) => soma + Number(p.valor), 0),
    aReceber: abertas.reduce((soma, p) => soma + Number(p.valor), 0),
  };
}

/** Uma parcela em aberto cujo vencimento já passou. */
export function estaAtrasada(p: Parcela): boolean {
  return p.status === "aberta" && new Date(`${p.vencimento}T00:00:00`).getTime() < hoje();
}

/**
 * A partir de quando avisar que é hora de encaminhar o financiamento.
 *
 * Seis meses antes do fim. O risco central do modelo não é a inadimplência das
 * 24 parcelas — é chegar no 25º mês com um comprador que não financia, e banco
 * não resolve isso em três semanas.
 */
export const MESES_DE_AVISO = 6;

export const horaDeFinanciar = (j: Jornada) => j.mes > j.prazo - MESES_DE_AVISO;

/** O mês da quitação: o seguinte ao fim da Trilha. */
export function quitacao(j: Jornada): Date {
  const d = new Date(j.fim);
  d.setMonth(d.getMonth() + 1);
  return d;
}
