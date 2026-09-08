import { extrairJson, perguntarGemini, type PartePergunta } from "@/lib/ia/gemini";

export type UnidadeLida = {
  identificacao?: string | null;
  tipologia?: string | null;
  valor?: number | null;
  num_quartos?: number | null;
  num_suites?: number | null;
  num_banheiros?: number | null;
  num_vagas?: number | null;
  metros_quadrados?: number | null;
  area_total?: number | null;
  area_garden?: number | null;
  posicao_solar?: string | null;
  numero_matricula?: string | null;
  matricula_vaga?: string | null;
  observacao?: string | null;
  origem?: string | null;
};

export type LeituraEstoque = {
  empreendimento?: string | null;
  endereco?: string | null;
  unidades: UnidadeLida[];
};

export type MetodoLeitura = "documento" | "planilha" | "texto";

const PROMPT = `Você recebeu a tabela de estoque de um empreendimento imobiliário.
Sua tarefa é extrair as unidades que estão DISPONÍVEIS para venda.

REGRAS OBRIGATÓRIAS:
1. Só inclua unidades que tenham um PREÇO em reais. Unidades marcadas como
   VENDIDO, RESERVADO, PERMUTA, INDISPONÍVEL, ou sem preço, devem ser IGNORADAS.
2. NUNCA deduza nem invente um valor. Se um campo não estiver claramente escrito
   no documento, use null. Campo vazio é melhor que campo errado.
3. Copie os números exatamente como aparecem, sem arredondar e sem converter.
4. Não invente unidades que não estão no documento.

Para cada unidade disponível, extraia:
- identificacao: número ou nome da unidade, como aparece (ex.: "Ap. 410")
- tipologia: como está escrito (ex.: "Studio", "1D", "Studio Garden", "2 dorm")
- valor: preço em reais, apenas números (ex.: 566600.00)
- num_quartos: número de dormitórios. Studio conta como 1.
- num_suites, num_banheiros, num_vagas: se houver
- metros_quadrados: área privativa
- area_total: área total, quando houver e for diferente da privativa
- area_garden: área de garden, se houver
- posicao_solar, numero_matricula, matricula_vaga: se houver
- observacao: observações daquela linha (ex.: "não aceita dação", "decorado")
- origem: a linha inteira como aparece no documento, em texto corrido

Extraia também:
- empreendimento: o nome do empreendimento
- endereco: o endereço, se aparecer

RESPONDA APENAS COM JSON, sem texto antes nem depois, neste formato:
{"empreendimento":"...","endereco":"...","unidades":[{...}]}`;

/** Decide como o arquivo vai ser lido a partir do tipo e do nome. */
export function escolherMetodo(nome: string, mime: string): MetodoLeitura {
  const ext = nome.toLowerCase().split(".").pop() ?? "";

  if (["xlsx", "xls", "xlsm", "ods"].includes(ext)) return "planilha";
  if (["csv", "txt", "tsv"].includes(ext)) return "texto";

  // PDF e imagens vão inteiros para a IA: ela lê tanto PDF com texto quanto
  // PDF que é imagem escaneada, sem precisarmos renderizar página por página.
  if (ext === "pdf" || mime === "application/pdf") return "documento";
  if (mime.startsWith("image/")) return "documento";

  // Word e o resto: tentamos como documento e, se vier vazio, o usuário saberá.
  return "documento";
}

export async function extrairEstoque({
  arquivo,
  nome,
  mime,
  contexto,
  metodo,
}: {
  arquivo: Buffer;
  nome: string;
  mime: string;
  contexto?: string;
  metodo: MetodoLeitura;
}): Promise<{ leitura: LeituraEstoque; tokens: number }> {
  const instrucao = contexto?.trim()
    ? `${PROMPT}\n\nCONTEXTO ADICIONAL DE QUEM ENVIOU O ARQUIVO (leve em conta):\n${contexto.trim()}`
    : PROMPT;

  const partes: PartePergunta[] = [];

  if (metodo === "documento") {
    partes.push({
      type: "document",
      data: arquivo.toString("base64"),
      mime_type: mime || "application/pdf",
    });
    partes.push({ type: "text", text: instrucao });
  } else {
    // Planilha e texto viram tabela em texto. Este caminho é mais seguro e
    // mais barato que o de imagem — nenhum valor precisa ser "lido", só lido.
    const texto =
      metodo === "planilha" ? await planilhaParaTexto(arquivo) : arquivo.toString("utf8");

    partes.push({
      type: "text",
      text: `${instrucao}\n\nCONTEÚDO DO ARQUIVO "${nome}":\n\n${texto.slice(0, 200_000)}`,
    });
  }

  const { texto, tokens } = await perguntarGemini(partes);
  const leitura = extrairJson<LeituraEstoque>(texto);

  if (!Array.isArray(leitura.unidades)) {
    throw new Error("A IA respondeu num formato inesperado (sem lista de unidades).");
  }

  return { leitura, tokens };
}

/** Converte a primeira planilha do arquivo em texto separado por " | ". */
async function planilhaParaTexto(arquivo: Buffer): Promise<string> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(arquivo as unknown as ArrayBuffer);

  const linhas: string[] = [];

  wb.eachSheet((planilha) => {
    linhas.push(`--- planilha: ${planilha.name} ---`);
    planilha.eachRow((linha) => {
      const celulas: string[] = [];
      linha.eachCell({ includeEmpty: true }, (celula) => {
        const v = celula.value;
        celulas.push(v === null || v === undefined ? "" : String(typeof v === "object" && "text" in v ? v.text : v));
      });
      if (celulas.some((c) => c.trim() !== "")) linhas.push(celulas.join(" | "));
    });
  });

  return linhas.join("\n");
}
