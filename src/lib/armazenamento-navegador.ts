import { createClient } from "@/lib/supabase/client";
import { BUCKET_FECHAMENTO, TAMANHO_MAXIMO, caminhoDoArquivo, tipoDoArquivo } from "@/lib/armazenamento";

/**
 * O envio, do lado do navegador.
 *
 * O arquivo vai DIRETO do navegador para o Supabase, com a sessão de quem está
 * logado. Não passa pela Vercel — que corta a requisição em 4,5 MB — e quem
 * decide se pode é a regra do bucket, no banco, não este código.
 *
 * Só pode ser importado por componente de cliente.
 */

/** Maior lado da foto depois de comprimida. Documento continua legível. */
const LADO_MAXIMO = 2200;
/** Abaixo disto não vale o trabalho de recomprimir. */
const COMPRIMIR_ACIMA_DE = 700 * 1024;

/**
 * Foto de documento tirada no celular tem 3 a 5 MB e precisa de 0,5. Reduz o
 * maior lado e regrava em JPEG. PDF, HEIC e imagem pequena passam intactos —
 * HEIC porque o Chrome não sabe desenhá-lo.
 *
 * Qualquer falha devolve o arquivo original: comprimir é economia, não
 * condição para enviar.
 */
export async function comprimirImagem(arquivo: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(arquivo.type) || arquivo.size < COMPRIMIR_ACIMA_DE) {
    return arquivo;
  }

  try {
    // `from-image` respeita a orientação gravada pela câmera; sem isso a foto
    // tirada em pé chega deitada.
    const imagem = await createImageBitmap(arquivo, { imageOrientation: "from-image" });
    const escala = Math.min(1, LADO_MAXIMO / Math.max(imagem.width, imagem.height));
    const largura = Math.round(imagem.width * escala);
    const altura = Math.round(imagem.height * escala);

    const tela = document.createElement("canvas");
    tela.width = largura;
    tela.height = altura;
    const contexto = tela.getContext("2d");
    if (!contexto) return arquivo;

    // PNG com fundo transparente viraria preto no JPEG.
    contexto.fillStyle = "#ffffff";
    contexto.fillRect(0, 0, largura, altura);
    contexto.drawImage(imagem, 0, 0, largura, altura);
    imagem.close();

    const blob = await new Promise<Blob | null>((ok) => tela.toBlob(ok, "image/jpeg", 0.82));
    if (!blob || blob.size >= arquivo.size) return arquivo;

    const nome = arquivo.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], nome, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return arquivo;
  }
}

export type ArquivoEnviado = {
  caminho: string;
  nome: string;
  tipo: string;
  tamanho: number;
};

/** Manda um arquivo para a tarefa. Não registra na tabela — isso é da action. */
export async function enviarArquivo(
  original: File,
  negocioId: string,
  tarefaId: string,
): Promise<{ ok: true; arquivo: ArquivoEnviado } | { ok: false; erro: string }> {
  const tipoOriginal = tipoDoArquivo(original.name, original.type);
  if (!tipoOriginal) {
    return { ok: false, erro: `"${original.name}" não é PDF nem imagem.` };
  }

  const arquivo = await comprimirImagem(original);
  const tipo = arquivo === original ? tipoOriginal : arquivo.type;

  if (arquivo.size > TAMANHO_MAXIMO) {
    return { ok: false, erro: `"${original.name}" passa de 10 MB. Reduza ou divida o arquivo.` };
  }

  const caminho = caminhoDoArquivo(negocioId, tarefaId, arquivo.name);
  const supabase = createClient();

  const { error } = await supabase.storage
    .from(BUCKET_FECHAMENTO)
    .upload(caminho, arquivo, { contentType: tipo, upsert: false });

  if (error) {
    // O Storage responde 403 com "row-level security" quando a regra barra.
    const barrado = /row-level security|unauthorized|403/i.test(error.message);
    return {
      ok: false,
      erro: barrado
        ? "Você não pode enviar arquivo nesta tarefa agora. Ela pode ter sido concluída por outra pessoa — recarregue a página."
        : `Não consegui enviar "${original.name}": ${error.message}`,
    };
  }

  return { ok: true, arquivo: { caminho, nome: arquivo.name, tipo, tamanho: arquivo.size } };
}

/** Desfaz um envio cujo registro falhou, para não sobrar arquivo órfão. */
export async function descartarEnvio(caminho: string): Promise<void> {
  await createClient().storage.from(BUCKET_FECHAMENTO).remove([caminho]);
}
