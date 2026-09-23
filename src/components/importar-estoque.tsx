"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { enviarArquivo } from "@/app/actions/importacao";
import { Alert, Button } from "@/components/ui";

/**
 * O envio do arquivo de estoque, no topo da tela de Importação de estoque.
 *
 * Não é um chat: a incorporadora vem de uma lista (nome digitado é ambíguo,
 * lista é exata) e o texto livre serve só para o que o arquivo não diz.
 */
export function ImportarEstoque({
  incorporadoras,
}: {
  incorporadoras: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [pendente, iniciar] = useTransition();
  const inputArquivo = useRef<HTMLInputElement>(null);

  const enviar = (formulario: FormData) => {
    setErro(null);
    iniciar(async () => {
      const resultado = await enviarArquivo(formulario);
      if (resultado.erro) {
        setErro(resultado.erro);
        return;
      }
      router.push(`/importacao/${resultado.id}`);
      router.refresh();
    });
  };

  return (
    <section className="mb-8 rounded-lg border border-border bg-white p-6">
      <div className="mb-5">
        <h2 className="text-xl font-semibold text-foreground">
          Adicione a lista de estoque para cadastrar as unidades
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Planilha, PDF, Word ou print. A IA lê o arquivo e monta o cadastro — você confere antes
          de qualquer coisa entrar no sistema.
        </p>
      </div>

      <form action={enviar} className="grid grid-cols-1 gap-4 sm:grid-cols-6">
        <div className="flex flex-col gap-1.5 sm:col-span-3">
          <label className="text-sm font-semibold text-foreground">
            Incorporadora
          </label>
          <select
            name="incorporadora_id"
            required
            defaultValue={incorporadoras.length === 1 ? incorporadoras[0].id : ""}
            className="w-full rounded-md border border-border bg-white px-3 py-2 text-[15px] text-foreground hover:border-foreground/20"
          >
            <option value="" disabled>
              Selecione
            </option>
            {incorporadoras.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nome}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-3">
          <label className="text-sm font-semibold text-foreground">
            Arquivo
          </label>
          <input
            ref={inputArquivo}
            type="file"
            name="arquivo"
            required
            accept=".pdf,.xlsx,.xls,.csv,.txt,.docx,.png,.jpg,.jpeg,.webp"
            onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
            className="w-full rounded-md border border-border bg-white px-3 py-1.5 text-[15px] text-foreground file:mr-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1.5 file:font-semibold file:text-foreground hover:border-foreground/20"
          />
          {arquivo ? (
            <p className="text-xs text-muted-foreground">
              {arquivo.name} · {(arquivo.size / 1024 / 1024).toFixed(2)} MB
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-6">
          <label className="text-sm font-semibold text-foreground">
            Alguma observação sobre este arquivo?
            <span className="font-body ml-1.5 text-xs font-normal normal-case text-muted-foreground">
              opcional
            </span>
          </label>
          <textarea
            name="contexto"
            rows={2}
            placeholder="Ex.: ignore as unidades de investidor · os valores já estão com desconto · é a tabela de setembro"
            className="w-full rounded-md border border-border bg-white px-3 py-2 text-[15px] text-foreground placeholder:text-muted-foreground hover:border-foreground/20"
          />
          <p className="text-xs text-muted-foreground">
            Use para o que o arquivo não diz. Isso vai junto na instrução da IA.
          </p>
        </div>

        {erro ? (
          <div className="sm:col-span-6">
            <Alert>{erro}</Alert>
          </div>
        ) : null}

        <div className="flex items-center gap-3 sm:col-span-6">
          <Button type="submit" disabled={pendente}>
            {pendente ? "Lendo o arquivo…" : "Ler arquivo"}
          </Button>
          {pendente ? (
            <span className="text-sm text-muted-foreground">
              Pode levar até um minuto. Não feche a página.
            </span>
          ) : null}
        </div>
      </form>
    </section>
  );
}
