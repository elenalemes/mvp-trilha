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
    <section className="mb-8 rounded-lg border border-trilha-200 bg-white p-6">
      <div className="mb-5">
        <h2 className="font-display text-xl font-semibold text-trilha-700">
          Adicione a lista de estoque para cadastrar as unidades
        </h2>
        <p className="mt-1 text-sm text-trilha-400">
          Planilha, PDF, Word ou print. A IA lê o arquivo e monta o cadastro — você confere antes
          de qualquer coisa entrar no sistema.
        </p>
      </div>

      <form action={enviar} className="grid grid-cols-1 gap-4 sm:grid-cols-6">
        <div className="flex flex-col gap-1.5 sm:col-span-3">
          <label className="font-display text-sm font-semibold tracking-wide text-trilha-700 uppercase">
            Incorporadora
          </label>
          <select
            name="incorporadora_id"
            required
            defaultValue={incorporadoras.length === 1 ? incorporadoras[0].id : ""}
            className="w-full rounded-md border border-trilha-200 bg-white px-3 py-2 text-[15px] text-trilha-900 hover:border-trilha-300"
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
          <label className="font-display text-sm font-semibold tracking-wide text-trilha-700 uppercase">
            Arquivo
          </label>
          <input
            ref={inputArquivo}
            type="file"
            name="arquivo"
            required
            accept=".pdf,.xlsx,.xls,.csv,.txt,.docx,.png,.jpg,.jpeg,.webp"
            onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
            className="w-full rounded-md border border-trilha-200 bg-white px-3 py-1.5 text-[15px] text-trilha-900 file:mr-3 file:rounded file:border-0 file:bg-trilha-100 file:px-3 file:py-1.5 file:font-semibold file:text-trilha-700 hover:border-trilha-300"
          />
          {arquivo ? (
            <p className="text-xs text-trilha-400">
              {arquivo.name} · {(arquivo.size / 1024 / 1024).toFixed(2)} MB
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-6">
          <label className="font-display text-sm font-semibold tracking-wide text-trilha-700 uppercase">
            Alguma observação sobre este arquivo?
            <span className="font-body ml-1.5 text-xs font-normal normal-case text-trilha-400">
              opcional
            </span>
          </label>
          <textarea
            name="contexto"
            rows={2}
            placeholder="Ex.: ignore as unidades de investidor · os valores já estão com desconto · é a tabela de setembro"
            className="w-full rounded-md border border-trilha-200 bg-white px-3 py-2 text-[15px] text-trilha-900 placeholder:text-trilha-300 hover:border-trilha-300"
          />
          <p className="text-xs text-trilha-400">
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
            <span className="text-sm text-trilha-400">
              Pode levar até um minuto. Não feche a página.
            </span>
          ) : null}
        </div>
      </form>
    </section>
  );
}
