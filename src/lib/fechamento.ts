/**
 * A leitura de um fechamento.
 *
 * Tudo aqui é função pura sobre a lista de tarefas — nada consulta banco. O
 * andamento de um negócio é uma conta sobre o que já está na mão, e tê-la em
 * um lugar só evita que a tela do admin, a da incorporadora e a página do
 * comprador discordem sobre quantos por cento faltam.
 *
 * A regra que organiza o resto: `etapa_ordem` é NÍVEL DE LIBERAÇÃO, não
 * posição numa fila. Duas etapas dividem o mesmo número quando correm juntas.
 * Um nível só abre quando todos os anteriores fecharam.
 */

export type Ator = "trilha" | "incorporadora" | "parceiro";
export type TipoTarefa = "documento" | "confirmacao" | "veredito";
export type StatusTarefa = "pendente" | "concluido" | "nao_se_aplica" | "reprovado";

export type Tarefa = {
  id: string;
  etapa: string;
  etapa_ordem: number;
  ordem: number;
  titulo: string;
  ator: Ator;
  tipo: TipoTarefa;
  exige_validade: boolean;
  interna: boolean;
  status: StatusTarefa;
  arquivo_path: string | null;
  referencia_externa: string | null;
  observacao: string | null;
  emitido_em: string | null;
  valido_ate: string | null;
  concluido_em: string | null;
};

export const NOME_DO_ATOR: Record<Ator, string> = {
  trilha: "Trilha",
  incorporadora: "Incorporadora",
  parceiro: "Corretor",
};

/** Fechada é tarefa que não espera mais ninguém. Reprovada NÃO fecha nada. */
export const estaFechada = (t: Tarefa) =>
  t.status === "concluido" || t.status === "nao_se_aplica";

/**
 * O nível que está aberto agora: o menor que ainda tem tarefa por fazer.
 * Quando tudo fechou, devolve null — o fechamento acabou.
 */
export function nivelAberto(tarefas: Tarefa[]): number | null {
  const abertos = tarefas.filter((t) => !estaFechada(t)).map((t) => t.etapa_ordem);
  return abertos.length ? Math.min(...abertos) : null;
}

/** Quanto do fechamento já andou, de 0 a 100. */
export function progresso(tarefas: Tarefa[]): number {
  if (tarefas.length === 0) return 0;
  return Math.round((tarefas.filter(estaFechada).length / tarefas.length) * 100);
}

/**
 * De quem é a bola.
 *
 * Só conta quem tem tarefa no nível ABERTO — quem deve algo do nível 3 não
 * está atrasado, está esperando a vez. É esta lista que vira a manchete da
 * tela, e não o percentual: um fechamento com 18 de 20 tarefas mostra 90% e
 * pode estar parado há três semanas por uma negativa de condomínio.
 */
export function bolaCom(tarefas: Tarefa[]): Ator[] {
  const nivel = nivelAberto(tarefas);
  if (nivel === null) return [];

  const atores = tarefas
    .filter((t) => !estaFechada(t) && t.etapa_ordem === nivel)
    .map((t) => t.ator);

  return [...new Set(atores)];
}

/**
 * Há quanto tempo nada acontece.
 *
 * Mede desde a última conclusão, ou desde o início se nada foi concluído
 * ainda. É o número que faz alguém se mexer — percentual não faz.
 */
export function diasParado(tarefas: Tarefa[], inicio: string): number {
  const marcos = tarefas
    .map((t) => t.concluido_em)
    .filter((d): d is string => Boolean(d))
    .concat(inicio);

  const ultimo = Math.max(...marcos.map((d) => new Date(d).getTime()));
  return Math.floor((Date.now() - ultimo) / 86_400_000);
}

export type Etapa = { nome: string; nivel: number; tarefas: Tarefa[] };

/** As etapas na ordem de nível e, dentro do nível, de nome. */
export function etapas(tarefas: Tarefa[]): Etapa[] {
  const mapa = new Map<string, Etapa>();

  for (const t of tarefas) {
    const atual = mapa.get(t.etapa);
    if (atual) atual.tarefas.push(t);
    else mapa.set(t.etapa, { nome: t.etapa, nivel: t.etapa_ordem, tarefas: [t] });
  }

  const lista = [...mapa.values()];
  for (const e of lista) e.tarefas.sort((a, b) => a.ordem - b.ordem);

  return lista.sort((a, b) => a.nivel - b.nivel || a.nome.localeCompare(b.nome, "pt-BR"));
}

/**
 * Se o ator que está olhando pode mexer nesta tarefa.
 *
 * A Trilha mexe em tudo — ela opera o fechamento inteiro e precisa poder
 * corrigir. Os outros, só no que é deles. O banco impõe isso de novo nas
 * policies; aqui é para não mostrar botão que só falharia.
 */
export function podeMexer(tarefa: Tarefa, ator: Ator | null): boolean {
  if (ator === "trilha") return true;
  return ator !== null && tarefa.ator === ator;
}

/**
 * Documento vencido, ou vencendo.
 *
 * CND e matrícula valem cerca de 30 dias. Um fechamento que empaca na vistoria
 * chega no contrato com papel morto, e quem emitiu é a parte com menos pressa
 * do fluxo — então o aviso precisa chegar antes, não no dia.
 */
export function validade(tarefa: Tarefa): { dias: number; venceu: boolean } | null {
  if (!tarefa.valido_ate || tarefa.status !== "concluido") return null;

  const dias = Math.ceil((new Date(tarefa.valido_ate).getTime() - Date.now()) / 86_400_000);
  return { dias, venceu: dias < 0 };
}
