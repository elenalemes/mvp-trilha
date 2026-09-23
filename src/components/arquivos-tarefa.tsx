"use client";

import { Paperclip, X } from "lucide-react";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { marcarPessoa, registrarArquivo, removerArquivo } from "@/app/actions/arquivos";
import { descartarEnvio, enviarArquivo } from "@/lib/armazenamento-navegador";
import { ACEITE_DO_SELETOR, formatarTamanho } from "@/lib/armazenamento";
import { NOME_DA_PESSOA, type Arquivo, type Pessoa } from "@/lib/fechamento";
import { Alert } from "@/components/ui";

/**
 * Os anexos de uma tarefa: a lista, o envio, a remoção.
 *
 * Vários arquivos por tarefa — três holerites, frente e verso do RG. No
 * documento, o primeiro arquivo conclui a tarefa e remover o último a reabre:
 * quem move o status é o banco, esta lista só anexa e remove.
 *
 * Nos documentos do comprador, quando a ficha tem cônjuge (casado ou união
 * estável), a lista se divide em dois grupos — "Comprador" e "Cônjuge" —, cada
 * um com o próprio botão de anexar. O grupo vazio avisa que falta, para a
 * Trilha ver sem abrir arquivo por arquivo — menos no cônjuge dos documentos
 * em que ele é opcional (comprovantes de endereço e de estado civil).
 */
export default function ArquivosTarefa({
  arquivos,
  tarefaId,
  negocioId,
  podeEnviar,
  podeAbrir,
  concluida,
  idSeletor,
  porPessoa = false,
  conjugeObrigatorio = true,
}: {
  arquivos: Arquivo[];
  tarefaId: string;
  negocioId: string;
  podeEnviar: boolean;
  podeAbrir: boolean;
  concluida: boolean;
  /** Id do seletor principal (comprador), para a caixa da tarefa abri-lo. */
  idSeletor?: string;
  /** Documento do comprador com cônjuge na ficha: anexos em dois grupos. */
  porPessoa?: boolean;
  /** No grupo do cônjuge: `false` troca "falta anexar" por "opcional". */
  conjugeObrigatorio?: boolean;
}) {
  const router = useRouter();
  const [enviando, setEnviando] = useState<string | null>(null);
  const [erros, setErros] = useState<string[]>([]);

  const enviar = async (lista: FileList | null, pessoa?: Pessoa) => {
    if (!lista || lista.length === 0) return;
    const falhas: string[] = [];

    // Um de cada vez: o progresso fica legível e um arquivo ruim não
    // atrapalha os outros.
    for (const arquivo of Array.from(lista)) {
      setEnviando(arquivo.name);

      const envio = await enviarArquivo(arquivo, negocioId, tarefaId);
      if (!envio.ok) {
        falhas.push(envio.erro);
        continue;
      }

      const registro = await registrarArquivo(tarefaId, negocioId, { ...envio.arquivo, pessoa });
      if (!registro.ok) {
        await descartarEnvio(envio.arquivo.caminho);
        falhas.push(registro.erro);
      }
    }

    setEnviando(null);
    setErros(falhas);
    router.refresh();
  };

  const executar = async (acao: () => Promise<{ ok: boolean; erro?: string }>) => {
    const r = await acao();
    setErros(r.ok ? [] : [r.erro ?? "Não consegui salvar."]);
    router.refresh();
  };

  // Concluída e sem nada à vista para quem não pode abrir: diz o porquê, em
  // vez de uma lista vazia que parece defeito.
  if (!podeAbrir) {
    return concluida ? (
      <p className="text-sm text-muted-foreground">Documento entregue · acesso restrito à Trilha e ao corretor</p>
    ) : null;
  }

  if (arquivos.length === 0 && !podeEnviar) return null;

  const props = {
    podeEnviar,
    enviando,
    remover: (id: string) => executar(() => removerArquivo(id, negocioId)),
  };

  return (
    <div className="flex flex-col gap-3">
      {porPessoa ? (
        (["comprador", "conjuge"] as const).map((pessoa) => {
          const doGrupo = arquivos.filter((a) => (a.pessoa ?? "comprador") === pessoa);
          const outra: Pessoa = pessoa === "comprador" ? "conjuge" : "comprador";
          return (
            <Grupo
              key={pessoa}
              {...props}
              titulo={NOME_DA_PESSOA[pessoa]}
              arquivos={doGrupo}
              faltando={doGrupo.length === 0 && arquivos.length > 0 && (pessoa === "comprador" || conjugeObrigatorio)}
              opcional={pessoa === "conjuge" && !conjugeObrigatorio}
              idSeletor={pessoa === "comprador" ? idSeletor : undefined}
              enviar={(lista) => enviar(lista, pessoa)}
              mover={{
                rotulo: `é do ${NOME_DA_PESSOA[outra].toLowerCase()}`,
                acao: (id) => executar(() => marcarPessoa(id, negocioId, outra)),
              }}
            />
          );
        })
      ) : (
        <Grupo {...props} arquivos={arquivos} idSeletor={idSeletor} enviar={(lista) => enviar(lista)} />
      )}

      {erros.map((e) => (
        <Alert key={e}>{e}</Alert>
      ))}
    </div>
  );
}

function Grupo({
  titulo,
  arquivos,
  faltando = false,
  opcional = false,
  podeEnviar,
  enviando,
  idSeletor,
  enviar,
  remover,
  mover,
}: {
  titulo?: string;
  arquivos: Arquivo[];
  faltando?: boolean;
  opcional?: boolean;
  podeEnviar: boolean;
  enviando: string | null;
  idSeletor?: string;
  enviar: (lista: FileList | null) => void;
  remover: (id: string) => void;
  mover?: { rotulo: string; acao: (id: string) => void };
}) {
  const seletor = useRef<HTMLInputElement>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1.5">
      {titulo ? (
        <p className="text-xs font-medium text-muted-foreground">
          {titulo}
          {faltando ? <span className="ml-1.5 font-semibold text-aviso">· falta anexar</span> : null}
          {opcional ? <span className="ml-1.5">· opcional</span> : null}
        </p>
      ) : null}

      {/* Arquivos e o botão de anexar na mesma faixa: cada arquivo é uma
          "pílula" com as ações dela; o anexar é a última, tracejada. */}
      <div className="flex flex-wrap items-center gap-2">
        {arquivos.map((a) => (
          <span
            key={a.id}
            className="inline-flex h-8 max-w-full items-center gap-2 rounded-lg border bg-card pr-1 pl-2.5 text-sm"
          >
            <IconeArquivo pdf={a.tipo_mime === "application/pdf"} />
            <a
              href={`/arquivos/${a.id}`}
              target="_blank"
              rel="noopener"
              className="min-w-0 max-w-[14rem] truncate font-medium text-foreground underline-offset-4 hover:underline"
              title={a.nome_original}
            >
              {a.nome_original}
            </a>
            <span className="text-xs text-muted-foreground tabular-nums">{formatarTamanho(a.tamanho_bytes)}</span>

            {podeEnviar && mover && confirmando !== a.id ? (
              <button
                type="button"
                onClick={() => mover.acao(a.id)}
                className="rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {mover.rotulo}
              </button>
            ) : null}

            {podeEnviar ? (
              confirmando === a.id ? (
                <span className="flex items-center gap-1 text-xs">
                  <span className="text-muted-foreground">Remover?</span>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmando(null);
                      remover(a.id);
                    }}
                    className="rounded-md px-1.5 py-0.5 font-semibold text-destructive hover:bg-erro-suave"
                  >
                    Sim
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmando(null)}
                    className="rounded-md px-1.5 py-0.5 text-foreground hover:bg-accent"
                  >
                    Não
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmando(a.id)}
                  aria-label={`Remover ${a.nome_original}`}
                  className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-erro-suave hover:text-destructive"
                >
                  <X className="size-3.5" />
                </button>
              )
            ) : null}
          </span>
        ))}

        {podeEnviar ? (
          <>
            <input
              ref={seletor}
              id={idSeletor}
              type="file"
              multiple
              accept={ACEITE_DO_SELETOR}
              className="hidden"
              onChange={(e) => {
                enviar(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => seletor.current?.click()}
              disabled={enviando !== null}
              title="PDF ou foto, até 10 MB"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-dashed border-foreground/25 px-2.5 text-sm font-medium text-foreground transition-colors hover:border-foreground/50 hover:bg-accent disabled:cursor-wait disabled:opacity-60"
            >
              <Paperclip className="size-3.5" aria-hidden="true" />
              {enviando ? `Enviando ${enviando}…` : arquivos.length ? "Anexar mais" : "Anexar"}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

function IconeArquivo({ pdf }: { pdf: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4 shrink-0 text-muted-foreground"
      aria-label={pdf ? "PDF" : "Imagem"}
    >
      {pdf ? (
        <path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm7 0v4h4M9 13h6M9 17h4" />
      ) : (
        <path d="M4 5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5Zm0 11 4-4 4 4 3-3 5 5M15 9h.01" />
      )}
    </svg>
  );
}
