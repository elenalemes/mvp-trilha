"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { concluirTarefa, reabrirTarefa, registrarVeredito } from "@/app/actions/fechamento";
import { NOME_DO_ATOR, validade, type Tarefa } from "@/lib/fechamento";
import { Alert, Button, Input, Textarea } from "@/components/ui";

/**
 * Uma tarefa do fechamento.
 *
 * Três formas, porque são três coisas diferentes:
 *
 *   documento   — alguém entrega um papel. Guarda de quando ele é e até quando
 *                 vale, porque CND vence.
 *   confirmação — alguém fez algo fora do sistema e diz que fez.
 *   veredito    — tem desfecho, e o desfecho pode derrubar o negócio.
 *
 * Quem não é responsável vê a tarefa e não vê botão. Ver o que o outro está
 * devendo é metade do valor desta tela; poder marcar por ele é que não.
 */
export default function TarefaFechamento({
  tarefa,
  negocioId,
  podeAgir,
  liberada,
}: {
  tarefa: Tarefa;
  negocioId: string;
  podeAgir: boolean;
  liberada: boolean;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [referencia, setReferencia] = useState(tarefa.referencia_externa ?? "");
  const [observacao, setObservacao] = useState(tarefa.observacao ?? "");
  const [emitido, setEmitido] = useState(tarefa.emitido_em ?? "");
  const [vence, setVence] = useState(tarefa.valido_ate ?? "");

  const fechada = tarefa.status === "concluido" || tarefa.status === "nao_se_aplica";
  const reprovada = tarefa.status === "reprovado";
  const prazo = validade(tarefa);

  const depois = (r: { ok: boolean; erro?: string }) => {
    setEnviando(false);
    if (!r.ok) {
      setErro(r.erro ?? "Não consegui salvar.");
      return;
    }
    setAberto(false);
    setErro(null);
    router.refresh();
  };

  const concluir = async () => {
    setEnviando(true);
    setErro(null);
    depois(
      await concluirTarefa(tarefa.id, negocioId, {
        referencia_externa: referencia,
        observacao,
        emitido_em: emitido,
        valido_ate: vence,
      }),
    );
  };

  const veredito = async (aprovado: boolean) => {
    setEnviando(true);
    setErro(null);
    depois(await registrarVeredito(tarefa.id, negocioId, aprovado, observacao));
  };

  const reabrir = async () => {
    setEnviando(true);
    setErro(null);
    depois(await reabrirTarefa(tarefa.id, negocioId));
  };

  return (
    <li className={`border-b border-trilha-100 px-5 py-4 last:border-0 ${liberada ? "" : "opacity-55"}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[15px] text-trilha-900">
            <Marca fechada={fechada} reprovada={reprovada} />
            <span className={fechada ? "text-trilha-400 line-through" : ""}>{tarefa.titulo}</span>
          </p>

          <p className="mt-0.5 ml-6 text-sm text-trilha-400">
            {NOME_DO_ATOR[tarefa.ator]}
            {tarefa.interna ? " · interna" : ""}
            {tarefa.concluido_em
              ? ` · ${new Date(tarefa.concluido_em).toLocaleDateString("pt-BR")}`
              : ""}
            {tarefa.referencia_externa ? ` · ${tarefa.referencia_externa}` : ""}
          </p>

          {prazo ? (
            <p
              className={`mt-1 ml-6 text-sm font-semibold ${
                prazo.venceu ? "text-red-700" : prazo.dias <= 10 ? "text-amber-700" : "text-trilha-400"
              }`}
            >
              {prazo.venceu
                ? `Documento vencido há ${Math.abs(prazo.dias)} dia(s) — precisa ser emitido de novo`
                : `Vence em ${prazo.dias} dia(s)`}
            </p>
          ) : null}

          {reprovada ? (
            <p className="mt-1 ml-6 text-sm font-semibold text-red-700">
              Reprovado{tarefa.observacao ? ` — ${tarefa.observacao}` : ""}
            </p>
          ) : null}
        </div>

        {podeAgir && !aberto ? (
          <div className="flex shrink-0 gap-2">
            {fechada || reprovada ? (
              <button
                type="button"
                onClick={reabrir}
                disabled={enviando}
                className="font-display text-sm font-semibold tracking-wide text-trilha-400 uppercase underline underline-offset-2 hover:text-trilha-700"
              >
                Desfazer
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setAberto(true)}
                className="font-display text-sm font-semibold tracking-wide text-trilha-500 uppercase underline underline-offset-2 hover:text-trilha-700"
              >
                {tarefa.tipo === "veredito" ? "Registrar" : "Marcar"}
              </button>
            )}
          </div>
        ) : null}
      </div>

      {aberto ? (
        <div className="mt-4 ml-6 flex flex-col gap-3 border-l-2 border-trilha-100 pl-4">
          {tarefa.tipo === "documento" ? (
            <>
              <Campo
                rotulo="Link do arquivo"
                dica="Enquanto o anexo não existe no sistema, cole aqui o link de onde o documento está."
              >
                <Input value={referencia} onChange={(e) => setReferencia(e.target.value)} />
              </Campo>

              <div className="grid gap-3 sm:grid-cols-2">
                <Campo rotulo="Emitido em">
                  <Input type="date" value={emitido} onChange={(e) => setEmitido(e.target.value)} />
                </Campo>
                {tarefa.exige_validade ? (
                  <Campo rotulo="Válido até" dica="CND e matrícula valem cerca de 30 dias.">
                    <Input type="date" value={vence} onChange={(e) => setVence(e.target.value)} />
                  </Campo>
                ) : null}
              </div>
            </>
          ) : tarefa.tipo === "confirmacao" ? (
            <Campo
              rotulo="Referência"
              dica="Nº da apólice, link do Autentique, id da cobrança — o que servir para achar depois."
            >
              <Input value={referencia} onChange={(e) => setReferencia(e.target.value)} />
            </Campo>
          ) : null}

          <Campo rotulo="Observação">
            <Textarea rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          </Campo>

          {erro ? <Alert>{erro}</Alert> : null}

          <div className="flex flex-wrap gap-2">
            {tarefa.tipo === "veredito" ? (
              <>
                <Button type="button" onClick={() => veredito(true)} disabled={enviando}>
                  Aprovado
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => veredito(false)}
                  disabled={enviando}
                >
                  Reprovado
                </Button>
              </>
            ) : (
              <Button type="button" onClick={concluir} disabled={enviando}>
                {enviando ? "Salvando…" : "Concluir tarefa"}
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={() => setAberto(false)} disabled={enviando}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : erro ? (
        <div className="mt-3 ml-6">
          <Alert>{erro}</Alert>
        </div>
      ) : null}
    </li>
  );
}

function Marca({ fechada, reprovada }: { fechada: boolean; reprovada: boolean }) {
  if (reprovada) return <span className="text-red-600">✕</span>;
  if (fechada) return <span className="text-emerald-600">✓</span>;
  return <span className="text-trilha-300">○</span>;
}

function Campo({
  rotulo,
  dica,
  children,
}: {
  rotulo: string;
  dica?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-display text-sm font-semibold tracking-wide text-trilha-700 uppercase">
        {rotulo}
      </span>
      {children}
      {dica ? <span className="text-xs text-trilha-400">{dica}</span> : null}
    </label>
  );
}
