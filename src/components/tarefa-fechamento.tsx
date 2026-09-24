"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  concluirTarefa,
  definirValidade,
  reabrirTarefa,
  registrarVeredito,
  salvarReferencia,
} from "@/app/actions/fechamento";
import { Check, X } from "lucide-react";
import { nomeDoAtor, recebeArquivo, validade, type Arquivo, type Tarefa } from "@/lib/fechamento";
import { Alert, Button, Input, Textarea } from "@/components/ui";
import ArquivosTarefa from "@/components/arquivos-tarefa";
import FormFicha from "@/components/form-ficha";
import { maritalLabel } from "@/lib/br";
import type { DadosComprador } from "@/lib/ficha";

/**
 * Uma tarefa do fechamento. Concluir é UM gesto, e o gesto depende do tipo:
 *
 *   confirmação — alguém fez algo fora do sistema. Marca a caixa e pronto;
 *                 desmarca para desfazer.
 *   documento   — anexar É concluir. A caixa abre o seletor de arquivo; o
 *                 primeiro anexo marca a tarefa, remover o último desmarca.
 *                 Quem move o status é o banco, a partir dos anexos.
 *   formulário  — os dados do comprador. A caixa abre os campos ali mesmo,
 *                 embaixo da tarefa; salvar com tudo preenchido conclui.
 *   veredito    — tem desfecho que pode derrubar o negócio, então não é
 *                 caixa: são dois botões, e reprovar pede o motivo.
 *
 * Quem não é responsável vê a tarefa e não vê controle. Ver o que o outro
 * está devendo é metade do valor desta tela; poder marcar por ele é que não.
 */
export default function TarefaFechamento({
  tarefa,
  negocioId,
  podeAgir,
  liberada,
  arquivos,
  podeAbrir,
  podeAbrirFicha,
  porPessoa,
  dadosComprador,
  cancelado,
  semCorretor = false,
}: {
  tarefa: Tarefa;
  negocioId: string;
  podeAgir: boolean;
  liberada: boolean;
  arquivos: Arquivo[];
  /** Pode abrir os anexos desta tarefa — espelho da regra do banco. */
  podeAbrir: boolean;
  /** Pode abrir a ficha de qualificação: Trilha e corretor. */
  podeAbrirFicha: boolean;
  /** Documento do comprador com cônjuge na ficha: anexos em dois grupos. */
  porPessoa: boolean;
  /** Só na tarefa de formulário, e só para quem lê a ficha (Trilha e corretor). */
  dadosComprador?: DadosComprador | null;
  cancelado?: boolean;
  /** Venda direta: as tarefas do corretor aparecem como da Trilha. */
  semCorretor?: boolean;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const fechada = tarefa.status === "concluido" || tarefa.status === "nao_se_aplica";
  const reprovada = tarefa.status === "reprovado";
  const idSeletor = `anexo-${tarefa.id}`;
  const [fichaAberta, setFichaAberta] = useState(false);
  const formulario = tarefa.tipo === "formulario" && podeAbrirFicha && dadosComprador;

  const executar = async (acao: () => Promise<{ ok: boolean; erro?: string }>) => {
    setOcupado(true);
    setErro(null);
    const r = await acao();
    setOcupado(false);
    if (!r.ok) {
      setErro(r.erro ?? "Não consegui salvar.");
      return false;
    }
    router.refresh();
    return true;
  };

  return (
    <li
      className={`border-t px-5 py-3.5 transition-colors ${fichaAberta ? "bg-muted/40" : ""} ${liberada ? "" : "opacity-60"}`}
    >
      <div className="flex items-start gap-3.5">
        <Caixa
          tarefa={tarefa}
          fechada={fechada}
          reprovada={reprovada}
          podeAgir={podeAgir}
          ocupado={ocupado}
          idSeletor={idSeletor}
          abrirFicha={formulario ? () => setFichaAberta((v) => !v) : undefined}
          alternar={() =>
            executar(() =>
              fechada ? reabrirTarefa(tarefa.id, negocioId) : concluirTarefa(tarefa.id, negocioId, {}),
            )
          }
        />

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className={`text-sm font-medium ${liberada ? "text-foreground" : "text-muted-foreground"}`}>
              {tarefa.titulo}
            </p>
            <span className="rounded-full border px-2 text-xs leading-5 text-muted-foreground">
              {nomeDoAtor(tarefa.ator, semCorretor)}
            </span>
            {tarefa.interna ? (
              <span className="rounded-full bg-muted px-2 text-xs leading-5 text-muted-foreground">Interna</span>
            ) : null}
            {tarefa.concluido_em ? (
              <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                {new Date(tarefa.concluido_em).toLocaleDateString("pt-BR")}
              </span>
            ) : null}
          </div>

          {tarefa.instrucoes && !fechada && liberada ? <Instrucoes texto={tarefa.instrucoes} /> : null}

          {formulario ? (
            <>
              {dadosComprador.salva && !fichaAberta ? (
                <p className="text-sm text-foreground">
                  {[
                    dadosComprador.valores.comprador.nome,
                    dadosComprador.valores.comprador.cpf,
                    maritalLabel(dadosComprador.estadoCivil),
                  ].join(" · ")}
                </p>
              ) : null}
              {!fichaAberta ? (
                <button
                  type="button"
                  onClick={() => setFichaAberta(true)}
                  className="self-start text-sm font-semibold text-foreground underline-offset-4 hover:underline hover:text-foreground"
                >
                  {!podeAgir || cancelado ? "Ver dados" : dadosComprador.salva ? "Editar dados" : "Preencher dados"}
                </button>
              ) : (
                <div className="mt-2">
                  <FormFicha
                    negocioId={negocioId}
                    inicial={dadosComprador.valores}
                    somenteLeitura={!podeAgir || !!cancelado}
                    aoFechar={() => setFichaAberta(false)}
                  />
                </div>
              )}
            </>
          ) : tarefa.tipo === "formulario" && fechada ? (
            <p className="text-sm text-muted-foreground">Dados preenchidos · acesso restrito à Trilha e ao corretor</p>
          ) : null}

          {recebeArquivo(tarefa) ? (
            <ArquivosTarefa
              arquivos={arquivos}
              tarefaId={tarefa.id}
              negocioId={negocioId}
              podeEnviar={podeAgir && tarefa.status !== "nao_se_aplica"}
              podeAbrir={podeAbrir}
              concluida={fechada}
              idSeletor={idSeletor}
              porPessoa={porPessoa}
              conjugeObrigatorio={tarefa.pede_conjuge}
            />
          ) : null}

          {tarefa.exige_validade ? (
            <Validade
              tarefa={tarefa}
              podeAgir={podeAgir}
              salvar={(data) => executar(() => definirValidade(tarefa.id, negocioId, data))}
            />
          ) : null}

          {tarefa.tipo === "confirmacao" && fechada ? (
            <Referencia
              valor={tarefa.referencia_externa}
              podeAgir={podeAgir}
              salvar={(texto) => executar(() => salvarReferencia(tarefa.id, negocioId, texto))}
            />
          ) : null}

          {tarefa.tipo === "veredito" ? (
            <Veredito
              tarefa={tarefa}
              podeAgir={podeAgir}
              ocupado={ocupado}
              decidir={(aprovado, motivo) =>
                executar(() => registrarVeredito(tarefa.id, negocioId, aprovado, motivo))
              }
              desfazer={() => executar(() => reabrirTarefa(tarefa.id, negocioId))}
            />
          ) : null}

          {erro ? <Alert>{erro}</Alert> : null}
        </div>
      </div>
    </li>
  );
}

// ------------------------------------------------------------------ a caixa

function Caixa({
  tarefa,
  fechada,
  reprovada,
  podeAgir,
  ocupado,
  idSeletor,
  abrirFicha,
  alternar,
}: {
  tarefa: Tarefa;
  fechada: boolean;
  reprovada: boolean;
  podeAgir: boolean;
  ocupado: boolean;
  idSeletor: string;
  /** Formulário: a caixa abre e fecha os campos embaixo da tarefa. */
  abrirFicha?: () => void;
  alternar: () => void;
}) {
  const visual = (
    <span
      aria-hidden="true"
      className={`mt-px flex size-5 shrink-0 items-center justify-center rounded-md border-[1.5px] transition-colors ${
        reprovada
          ? "border-destructive bg-destructive text-white"
          : fechada
            ? "border-sucesso bg-sucesso text-white"
            : podeAgir
              ? "border-foreground/35 bg-card group-hover:border-foreground/60"
              : "border-dashed border-border bg-muted/50"
      }`}
    >
      {reprovada ? <X className="size-3.5" strokeWidth={3} /> : fechada ? <Check className="size-3.5" strokeWidth={3} /> : null}
    </span>
  );

  // Confirmação: uma caixa de verdade, que marca e desmarca.
  if (tarefa.tipo === "confirmacao" && podeAgir) {
    return (
      <label className={`group ${ocupado ? "cursor-wait" : "cursor-pointer"}`} title={fechada ? "Desmarcar" : "Marcar como feito"}>
        <input
          type="checkbox"
          className="sr-only"
          checked={fechada}
          disabled={ocupado}
          onChange={alternar}
          aria-label={tarefa.titulo}
        />
        {visual}
      </label>
    );
  }

  // Documento pendente: a caixa abre o seletor de arquivo.
  if (tarefa.tipo === "documento" && podeAgir && !fechada) {
    return (
      <label htmlFor={idSeletor} className="group cursor-pointer" title="Anexar o documento">
        {visual}
        <span className="sr-only">Anexar {tarefa.titulo}</span>
      </label>
    );
  }

  // Formulário: a caixa abre os campos embaixo da tarefa — também depois de
  // concluída, para editar. Salvar de novo não desmarca nada.
  if (abrirFicha && podeAgir) {
    return (
      <button type="button" onClick={abrirFicha} className="group" title={fechada ? "Editar os dados" : "Preencher os dados"}>
        {visual}
        <span className="sr-only">{fechada ? "Editar" : "Preencher"} {tarefa.titulo}</span>
      </button>
    );
  }

  return (
    <span title={tarefa.tipo === "documento" && fechada && podeAgir ? "Para desmarcar, remova os arquivos" : undefined}>
      {visual}
    </span>
  );
}

// ------------------------------------------------------------ instruções

/** Texto com quebras de linha e links clicáveis. Longo, fica recolhido. */
function Instrucoes({ texto }: { texto: string }) {
  const corpo = (
    <p className="text-sm whitespace-pre-line text-foreground">
      {texto.split(/(https?:\/\/\S+)/g).map((parte, i) =>
        /^https?:\/\//.test(parte) ? (
          <a key={i} href={parte} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline hover:text-foreground">
            {parte}
          </a>
        ) : (
          parte
        ),
      )}
    </p>
  );

  if (texto.length <= 140) return corpo;

  return (
    <details className="group">
      <summary className="cursor-pointer text-sm text-foreground underline-offset-4 hover:underline hover:text-foreground">
        O que é aceito
      </summary>
      <div className="mt-2 border-l-2 border-border pl-3">{corpo}</div>
    </details>
  );
}

// -------------------------------------------------------------- validade

function Validade({
  tarefa,
  podeAgir,
  salvar,
}: {
  tarefa: Tarefa;
  podeAgir: boolean;
  salvar: (data: string) => Promise<boolean>;
}) {
  const [editando, setEditando] = useState(false);
  const [data, setData] = useState(tarefa.valido_ate ?? "");
  const prazo = validade(tarefa);
  if (!prazo) return null;

  if (editando) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-foreground">Válido até</span>
        <Input type="date" value={data} onChange={(e) => setData(e.target.value)} className="w-auto py-1" />
        <button
          type="button"
          onClick={async () => (await salvar(data)) && setEditando(false)}
          className="font-semibold text-foreground underline-offset-4 hover:underline"
        >
          Salvar
        </button>
        <button type="button" onClick={() => setEditando(false)} className="text-muted-foreground underline-offset-4 hover:underline">
          Cancelar
        </button>
      </div>
    );
  }

  const quando = new Date(`${tarefa.valido_ate}T12:00:00`).toLocaleDateString("pt-BR");

  return (
    <p
      className={`text-sm font-semibold ${
        prazo.venceu ? "text-destructive" : prazo.dias <= 10 ? "text-aviso" : "text-foreground"
      }`}
    >
      {prazo.venceu
        ? `Vencido desde ${quando} — precisa ser emitido de novo`
        : `Válido até ${quando} (${prazo.dias} dia${prazo.dias === 1 ? "" : "s"})`}
      {podeAgir ? (
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="ml-2 font-normal text-muted-foreground underline-offset-4 hover:underline hover:text-foreground"
        >
          corrigir data
        </button>
      ) : null}
    </p>
  );
}

// ------------------------------------------------------------ referência

function Referencia({
  valor,
  podeAgir,
  salvar,
}: {
  valor: string | null;
  podeAgir: boolean;
  salvar: (texto: string) => Promise<boolean>;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(valor ?? "");

  if (editando) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Nº da apólice, link do Autentique, id da cobrança"
          className="max-w-md py-1"
          autoFocus
        />
        <button
          type="button"
          onClick={async () => (await salvar(texto)) && setEditando(false)}
          className="font-semibold text-foreground underline-offset-4 hover:underline"
        >
          Salvar
        </button>
        <button type="button" onClick={() => setEditando(false)} className="text-muted-foreground underline-offset-4 hover:underline">
          Cancelar
        </button>
      </div>
    );
  }

  if (!valor && !podeAgir) return null;

  return (
    <p className="text-sm text-foreground">
      {valor ? <span className="break-all">{valor}</span> : null}
      {podeAgir ? (
        <button
          type="button"
          onClick={() => setEditando(true)}
          className={`${valor ? "ml-2" : ""} text-muted-foreground underline-offset-4 hover:underline hover:text-foreground`}
        >
          {valor ? "editar" : "adicionar referência"}
        </button>
      ) : null}
    </p>
  );
}

// -------------------------------------------------------------- veredito

function Veredito({
  tarefa,
  podeAgir,
  ocupado,
  decidir,
  desfazer,
}: {
  tarefa: Tarefa;
  podeAgir: boolean;
  ocupado: boolean;
  decidir: (aprovado: boolean, motivo?: string) => Promise<boolean>;
  desfazer: () => void;
}) {
  const [reprovando, setReprovando] = useState(false);
  const [motivo, setMotivo] = useState("");

  if (tarefa.status === "reprovado") {
    return (
      <p className="text-sm font-semibold text-destructive">
        Reprovado{tarefa.observacao ? ` — ${tarefa.observacao}` : ""}
        {podeAgir ? (
          <button type="button" onClick={desfazer} disabled={ocupado} className="ml-2 font-normal text-muted-foreground underline-offset-4 hover:underline">
            desfazer
          </button>
        ) : null}
      </p>
    );
  }

  if (tarefa.status === "concluido") {
    return (
      <p className="text-sm font-semibold text-sucesso">
        Aprovado{tarefa.observacao ? ` — ${tarefa.observacao}` : ""}
        {podeAgir ? (
          <button type="button" onClick={desfazer} disabled={ocupado} className="ml-2 font-normal text-muted-foreground underline-offset-4 hover:underline">
            desfazer
          </button>
        ) : null}
      </p>
    );
  }

  if (!podeAgir) return null;

  if (reprovando) {
    return (
      <div className="flex flex-col gap-2">
        <Textarea
          rows={2}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Motivo da reprovação"
          autoFocus
        />
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={() => decidir(false, motivo)}
            disabled={ocupado || !motivo.trim()}
            className="bg-destructive hover:bg-destructive/90"
          >
            Confirmar reprovação
          </Button>
          <Button type="button" variant="ghost" onClick={() => setReprovando(false)} disabled={ocupado}>
            Cancelar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <Button type="button" onClick={() => decidir(true)} disabled={ocupado}>
        Aprovar
      </Button>
      <Button type="button" variant="ghost" onClick={() => setReprovando(true)} disabled={ocupado}>
        Reprovar
      </Button>
    </div>
  );
}
