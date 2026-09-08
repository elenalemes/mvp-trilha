/**
 * Chamada ao Gemini.
 *
 * Todo contato com a IA passa por aqui. Trocar de fornecedor depois é mexer
 * neste arquivo e em mais nenhum.
 *
 * Formato confirmado com chamadas reais em 2/set/2026:
 *   POST /v1beta/interactions
 *   { model, input: [ {type:"document"|"text", ...} ] }
 *   resposta: { steps: [ {type:"thought"}, {type:"model_output", content:[{text}]} ] }
 */

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";

/**
 * Lista de modelos, em ordem de preferência. O tier gratuito congestiona com
 * frequência ("high demand"), e quando isso acontece costuma ser por modelo —
 * então tentar o próximo resolve mais rápido do que insistir no mesmo.
 *
 * Configurável por `GEMINI_MODELS` no .env.local, separado por vírgula.
 */
const MODELOS = (process.env.GEMINI_MODELS ?? process.env.GEMINI_MODEL ?? "gemini-3.8-flash")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

export type PartePergunta =
  | { type: "text"; text: string }
  | { type: "document"; data: string; mime_type: string };

type Resposta = {
  steps?: { type?: string; content?: { text?: string }[] }[];
  usage?: { total_tokens?: number };
};

/** Erro de congestionamento/cota: a IA está indisponível, o arquivo está ok. */
export class IaOcupadaError extends Error {
  constructor(public detalhe: string) {
    super("A IA está congestionada no momento.");
    this.name = "IaOcupadaError";
  }
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type ResultadoIA = { texto: string; tokens: number; modelo: string };

export async function perguntarGemini(
  partes: PartePergunta[],
  tentativasPorModelo = 2,
): Promise<ResultadoIA> {
  const chave = process.env.GEMINI_API_KEY;
  if (!chave) throw new Error("GEMINI_API_KEY não configurada no .env.local.");

  let ultimoDetalhe = "";
  let todosOcupados = true;

  for (const modelo of MODELOS) {
    for (let tentativa = 1; tentativa <= tentativasPorModelo; tentativa++) {
      let resposta: Response;

      try {
        resposta = await fetch(ENDPOINT, {
          method: "POST",
          headers: { "x-goog-api-key": chave, "Content-Type": "application/json" },
          body: JSON.stringify({ model: modelo, input: partes }),
        });
      } catch (e) {
        ultimoDetalhe = e instanceof Error ? e.message : "falha de rede";
        todosOcupados = false;
        break;
      }

      if (resposta.ok) {
        const dados = (await resposta.json()) as Resposta;
        const texto = dados.steps?.find((s) => s.type === "model_output")?.content?.[0]?.text ?? "";
        if (!texto) throw new Error("A IA respondeu, mas sem conteúdo de texto.");
        return { texto, tokens: dados.usage?.total_tokens ?? 0, modelo };
      }

      const corpo = await resposta.text();
      ultimoDetalhe = `${modelo} → ${resposta.status}: ${corpo.slice(0, 200)}`;

      const ocupado =
        resposta.status === 429 ||
        resposta.status >= 500 ||
        /high demand|quota|rate limit|unavailable/i.test(corpo);

      if (!ocupado) {
        // Erro de verdade (formato, permissão): não adianta insistir nem trocar.
        todosOcupados = false;
        throw new Error(`A IA recusou a requisição. ${ultimoDetalhe}`);
      }

      if (tentativa < tentativasPorModelo) await esperar(2500 * tentativa);
    }
    // Modelo congestionado: passa para o próximo da lista.
  }

  if (todosOcupados) throw new IaOcupadaError(ultimoDetalhe);
  throw new Error(`A IA não respondeu. ${ultimoDetalhe}`);
}

/**
 * A resposta vem embrulhada em ```json ... ``` mesmo quando se pede JSON puro.
 * Descasca antes de tentar interpretar.
 */
export function extrairJson<T>(texto: string): T {
  const limpo = texto
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  try {
    return JSON.parse(limpo) as T;
  } catch {
    const inicio = limpo.indexOf("{");
    const fim = limpo.lastIndexOf("}");
    if (inicio >= 0 && fim > inicio) return JSON.parse(limpo.slice(inicio, fim + 1)) as T;
    throw new Error("A IA não devolveu um JSON válido.");
  }
}
