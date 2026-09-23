/**
 * Onde moram os arquivos do fechamento, e em que formato.
 *
 * Tudo o que depende do provedor de armazenamento está neste arquivo e em
 * `armazenamento-navegador.ts` (o envio) e `app/arquivos/[id]/route.ts` (a
 * abertura). Se um dia os arquivos forem para o Cloudflare R2, a troca é
 * nesses três lugares — as telas e as actions não sabem onde o arquivo mora,
 * só conhecem o `caminho`.
 *
 * Este arquivo não importa nada de servidor nem de navegador: os dois lados
 * usam as mesmas regras de formato.
 */

export const BUCKET_FECHAMENTO = "fechamento";

/** O mesmo teto do bucket. Conferir aqui evita subir 40 MB para ouvir "não". */
export const TAMANHO_MAXIMO = 10 * 1024 * 1024;

/** Tipos aceitos, espelho de `allowed_mime_types` do bucket. */
export const TIPOS_ACEITOS = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

/** O `accept` do seletor de arquivo. Extensões junto porque o Windows não
 *  informa o tipo do HEIC, e o seletor esconderia a foto do iPhone. */
export const ACEITE_DO_SELETOR = ".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,image/*";

const POR_EXTENSAO: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

/** O tipo do arquivo, pelo navegador ou, na falta, pela extensão. */
export function tipoDoArquivo(nome: string, tipoInformado: string): string | null {
  const tipo = tipoInformado.toLowerCase();
  if ((TIPOS_ACEITOS as readonly string[]).includes(tipo)) return tipo;

  const extensao = nome.split(".").pop()?.toLowerCase() ?? "";
  return POR_EXTENSAO[extensao] ?? null;
}

/**
 * Nome seguro para ir dentro do caminho. O nome original, com acento e
 * espaço, fica guardado na tabela; o caminho só precisa ser legível para quem
 * olhar o bucket no painel do Supabase.
 */
function nomeParaCaminho(nome: string): string {
  const limpo = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return (limpo || "arquivo").slice(-80);
}

/**
 * `<negocio>/<tarefa>/<aleatório>-<nome>`.
 *
 * O formato NÃO é detalhe: as regras do bucket leem a tarefa pelo segundo
 * pedaço e conferem o negócio pelo primeiro. Arquivo fora deste formato não
 * sobe. O pedaço aleatório deixa mandar dois arquivos com o mesmo nome.
 */
export function caminhoDoArquivo(negocioId: string, tarefaId: string, nome: string): string {
  const aleatorio = crypto.randomUUID().slice(0, 8);
  return `${negocioId}/${tarefaId}/${aleatorio}-${nomeParaCaminho(nome)}`;
}

/** O caminho pertence mesmo a esta tarefa deste negócio? */
export function caminhoPertence(caminho: string, negocioId: string, tarefaId: string): boolean {
  const partes = caminho.split("/");
  return partes.length === 3 && partes[0] === negocioId && partes[1] === tarefaId && partes[2] !== "";
}

export function formatarTamanho(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}
