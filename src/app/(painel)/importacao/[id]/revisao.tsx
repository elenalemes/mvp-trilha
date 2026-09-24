"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatBRL } from "@/lib/br";
import { Alert, Button, Stat } from "@/components/ui";
import {
  alterarLinha,
  aplicarImportacao,
  descartarImportacao,
  vincularEmpreendimento,
} from "@/app/actions/importacao";
import type { LinhaImportacao, Plano } from "@/lib/importacao/plano";

const ROTULO_ACAO: Record<string, string> = {
  criar: "Nova",
  atualizar: "Atualiza",
  ignorar: "Intocável",
};

const COR_ACAO: Record<string, string> = {
  criar: "border-sucesso/20 bg-sucesso-suave text-sucesso",
  atualizar: "border-aviso/20 bg-aviso-suave text-aviso",
  ignorar: "border-border bg-muted text-muted-foreground",
};

/** Semelhança grosseira entre nomes, para sugerir o empreendimento certo. */
function pareceCom(a: string, b: string) {
  const limpa = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((p) => p.length > 2);

  const pa = limpa(a);
  const pb = new Set(limpa(b));
  if (pa.length === 0) return 0;
  return pa.filter((p) => pb.has(p)).length / pa.length;
}

export function Revisao({
  importacaoId,
  empreendimentoId,
  empreendimentoDetectado,
  enderecoDetectado,
  empreendimentos,
  linhas,
  plano,
}: {
  importacaoId: string;
  empreendimentoId: string | null;
  empreendimentoDetectado: string | null;
  enderecoDetectado: string | null;
  empreendimentos: { id: string; nome: string }[];
  linhas: LinhaImportacao[];
  plano: Plano | null;
}) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const sugestao = empreendimentoDetectado
    ? empreendimentos
        .map((e) => ({ ...e, nota: pareceCom(empreendimentoDetectado, e.nome) }))
        .filter((e) => e.nota >= 0.5)
        .sort((a, b) => b.nota - a.nota)[0]
    : undefined;

  const [escolha, setEscolha] = useState<string>(empreendimentoId ?? sugestao?.id ?? "novo");
  const [nomeNovo, setNomeNovo] = useState(empreendimentoDetectado ?? "");

  const vincular = () =>
    iniciar(async () => {
      setErro(null);
      const r = await vincularEmpreendimento(
        importacaoId,
        escolha === "novo"
          ? { novoNome: nomeNovo, novoEndereco: enderecoDetectado ?? undefined }
          : { empreendimentoId: escolha },
      );
      if (r.erro) setErro(r.erro);
      router.refresh();
    });

  const mudarLinha = (id: string, campos: Parameters<typeof alterarLinha>[1]) =>
    iniciar(async () => {
      const r = await alterarLinha(id, campos);
      if (r.erro) setErro(r.erro);
      router.refresh();
    });

  const aplicar = () =>
    iniciar(async () => {
      setErro(null);
      const r = await aplicarImportacao(importacaoId);
      if (r.erro) {
        setErro(r.erro);
        return;
      }
      router.push(`/empreendimentos/${r.id}`);
      router.refresh();
    });

  const descartar = () =>
    iniciar(async () => {
      await descartarImportacao(importacaoId);
      router.push("/incorporadoras");
      router.refresh();
    });

  // ---------- passo 1: empreendimento ----------

  if (!empreendimentoId || !plano) {
    return (
      <section className="rounded-xl border bg-card p-6 shadow-xs">
        <h2 className="text-xl font-semibold text-foreground">
          A qual empreendimento estas {linhas.length} unidades pertencem?
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A IA leu no arquivo:{" "}
          <span className="font-medium text-foreground">
            {empreendimentoDetectado ?? "nada identificável"}
          </span>
          {enderecoDetectado ? ` · ${enderecoDetectado}` : ""}
        </p>

        <div className="mt-5 flex flex-col gap-3">
          {empreendimentos.map((e) => (
            <label
              key={e.id}
              className="flex cursor-pointer items-center gap-3 rounded-md border border-border px-4 py-3 hover:bg-accent"
            >
              <input
                type="radio"
                name="empreendimento"
                checked={escolha === e.id}
                onChange={() => setEscolha(e.id)}
                className="accent-primary"
              />
              <span className="text-sm text-foreground">{e.nome}</span>
              {sugestao?.id === e.id ? (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">
                  parece este
                </span>
              ) : null}
            </label>
          ))}

          <label className="flex cursor-pointer flex-col gap-2 rounded-md border border-border px-4 py-3 hover:bg-accent">
            <span className="flex items-center gap-3">
              <input
                type="radio"
                name="empreendimento"
                checked={escolha === "novo"}
                onChange={() => setEscolha("novo")}
                className="accent-primary"
              />
              <span className="text-sm text-foreground">Criar um empreendimento novo</span>
            </span>
            {escolha === "novo" ? (
              <input
                value={nomeNovo}
                onChange={(e) => setNomeNovo(e.target.value)}
                placeholder="Nome do empreendimento"
                className="ml-7 rounded-md border border-border px-3 py-2 text-sm"
              />
            ) : null}
          </label>
        </div>

        {erro ? (
          <div className="mt-4">
            <Alert>{erro}</Alert>
          </div>
        ) : null}

        <div className="mt-5 flex items-center gap-3">
          <Button type="button" onClick={vincular} disabled={pendente}>
            {pendente ? "Salvando…" : "Continuar"}
          </Button>
          <button
            type="button"
            onClick={descartar}
            disabled={pendente}
            className="px-2 text-sm font-semibold text-muted-foreground underline-offset-4 hover:underline hover:text-foreground"
          >
            Descartar importação
          </button>
        </div>
      </section>
    );
  }

  // ---------- passo 2: conferência ----------

  const { resumo, itens, desaparecidas } = plano;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat valor={resumo.criar} label="Novas" tom="positivo" />
        <Stat valor={resumo.atualizar} label="Atualizadas" tom="atencao" />
        <Stat valor={resumo.indisponibilizar} label="Vão sair do estoque" />
        <Stat valor={resumo.ignorar} label="Intocáveis" />
      </div>

      {desaparecidas.length > 0 ? (
        <p className="rounded-md border border-border bg-muted/50 px-4 py-3 text-sm text-foreground">
          <span className="font-semibold">
            {desaparecidas.length} unidade{desaparecidas.length === 1 ? "" : "s"} que estava
            {desaparecidas.length === 1 ? "" : "m"} disponível no sistema não veio neste arquivo
          </span>{" "}
          e vai ser marcada como indisponível:{" "}
          {desaparecidas.map((d) => d.identificacao).join(", ")}.
        </p>
      ) : null}

      {resumo.ignorar > 0 ? (
        <p className="rounded-md border border-border bg-muted px-4 py-3 text-sm text-foreground">
          Unidades marcadas como <strong>intocáveis</strong> já estão Em Trilha, Em negociação ou
          reservadas no sistema. A importação não altera nenhuma delas.
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
        <table className="w-full min-w-[900px] border-collapse text-left">
          <thead>
            <tr className="border-b border-border">
              {["", "Unidade", "Valor", "Tipologia", "Características", "O que vai acontecer", "No arquivo"].map(
                (h, i) => (
                  <th
                    key={`${h}-${i}`}
                    className="bg-muted/50 px-4 py-2.5 text-xs font-medium whitespace-nowrap text-muted-foreground"
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {itens.map(({ linha, acao, valorAntigo }) => (
              <tr
                key={linha.id}
                className={`border-b border-border last:border-0 ${
                  linha.incluir ? "" : "opacity-40"
                }`}
              >
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={linha.incluir}
                    onChange={(e) => mudarLinha(linha.id, { incluir: e.target.checked })}
                    className="size-4 accent-primary"
                    aria-label="incluir"
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    defaultValue={linha.identificacao ?? ""}
                    onBlur={(e) => {
                      if (e.target.value !== (linha.identificacao ?? "")) {
                        mudarLinha(linha.id, { identificacao: e.target.value });
                      }
                    }}
                    className="w-32 rounded border border-transparent bg-transparent px-1.5 py-1 text-[16px] font-semibold text-foreground hover:border-border focus:border-ring"
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    defaultValue={linha.valor ?? ""}
                    inputMode="decimal"
                    onBlur={(e) => {
                      if (e.target.value !== String(linha.valor ?? "")) {
                        mudarLinha(linha.id, { valor: e.target.value });
                      }
                    }}
                    className="w-32 rounded border border-transparent bg-transparent px-1.5 py-1 text-sm tabular-nums text-foreground hover:border-border focus:border-ring"
                  />
                  {valorAntigo !== undefined && valorAntigo !== null && valorAntigo !== linha.valor ? (
                    <span className="block text-xs text-muted-foreground line-through">
                      {formatBRL(valorAntigo)}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-sm">{linha.tipologia ?? "—"}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {[
                    linha.num_quartos ? `${linha.num_quartos} dorm.` : null,
                    linha.num_vagas ? `${linha.num_vagas} vaga(s)` : null,
                    linha.metros_quadrados ? `${linha.metros_quadrados} m²` : null,
                    linha.observacao,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block rounded-full border px-2.5 py-0.5 text-sm font-semibold ${COR_ACAO[acao]}`}
                  >
                    {ROTULO_ACAO[acao]}
                  </span>
                  {linha.alertas.length > 0 ? (
                    <span className="mt-1 block text-xs text-destructive">
                      {linha.alertas.join(" · ")}
                    </span>
                  ) : null}
                </td>
                <td className="max-w-xs px-4 py-3 text-xs text-muted-foreground">
                  {linha.origem ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {erro ? <Alert>{erro}</Alert> : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={aplicar} disabled={pendente}>
          {pendente ? "Aplicando…" : "Aprovar e cadastrar"}
        </Button>
        <button
          type="button"
          onClick={descartar}
          disabled={pendente}
          className="px-2 text-sm font-semibold text-muted-foreground underline-offset-4 hover:underline hover:text-foreground"
        >
          Descartar importação
        </button>
      </div>
    </div>
  );
}
