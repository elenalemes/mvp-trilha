"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { alternarCobrancaAutomatica, definirPrimeiroVencimento, definirVencimentoAto } from "@/app/actions/cobranca";
import { Alert } from "@/components/ui";

/**
 * O quadro de cobrança da trilha. Só a Trilha vê.
 *
 * Três decisões moram aqui:
 *
 *   0. QUANDO VENCE O ATO. A entrada do fechamento: no dia da assinatura ou no
 *      próximo dia 10. Data própria — mudar não mexe nas parcelas.
 *
 *   1. QUANDO VENCE A 1ª PARCELA. Às vezes o comprador paga a primeira no ato
 *      do fechamento (vence no próprio dia); às vezes, fechando no fim do mês,
 *      ela vai para o próximo dia 10. Da segunda em diante é sempre dia 10.
 *      Só dá para mudar enquanto nenhuma parcela foi cobrada ou paga — depois
 *      disso a data já está na fatura do cliente.
 *
 *   2. SE A TRILHA ENTRA NA COBRANÇA AUTOMÁTICA. Desligada, o sistema não gera
 *      nada sozinho para ela. Na conta real do Asaas, nem o botão manual
 *      cobra sem isto ligado.
 */
export default function CobrancaTrilha({
  negocioId,
  ambiente,
  liberada,
  primeiroVencimento,
  datasTravadas,
  atoVencimento,
  atoTravado,
}: {
  negocioId: string;
  ambiente: "sandbox" | "producao" | null;
  liberada: boolean;
  primeiroVencimento: string | null;
  /** Alguma parcela já foi cobrada ou paga: as datas não mudam mais. */
  datasTravadas: boolean;
  /** Null = esta trilha não tem ato (proposta sem ato). */
  atoVencimento: string | null;
  /** O ato já foi cobrado ou pago: a data dele não muda mais. */
  atoTravado: boolean;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const executar = async (acao: () => Promise<{ ok: true } | { ok: false; erro: string }>, sucesso: string) => {
    setOcupado(true);
    setErro(null);
    setOk(null);
    const r = await acao();
    setOcupado(false);
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    setOk(sucesso);
    router.refresh();
  };

  return (
    <section className="rounded-xl border bg-card p-5 shadow-xs">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Cobrança</h2>
        {ambiente ? (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              ambiente === "producao" ? "bg-erro-suave text-destructive" : "bg-muted text-muted-foreground"
            }`}
          >
            {ambiente === "producao" ? "Asaas real" : "Asaas teste"}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-4 text-sm">
        {/* --------------------------------------------------- ato */}
        {atoVencimento !== null ? (
          <Vencimento
            id="vencimento-ato"
            rotulo="Vencimento do ato"
            valor={atoVencimento}
            travado={atoTravado}
            motivoTrava="O ato já foi cobrado ou pago: a data não muda mais."
            atalhoHoje="hoje (no fechamento)"
            nota="Só o ato muda; as parcelas seguem a data delas."
            ocupado={ocupado}
            aplicar={(d) => executar(() => definirVencimentoAto(negocioId, d), "Data do ato atualizada.")}
          />
        ) : null}

        {/* ------------------------------------------- 1ª parcela */}
        <Vencimento
          id="primeiro-vencimento"
          rotulo="Vencimento da 1ª parcela"
          valor={primeiroVencimento}
          travado={datasTravadas}
          motivoTrava="Já há parcela cobrada ou paga: as datas não mudam mais."
          atalhoHoje="hoje (paga no ato)"
          nota="Da 2ª em diante, sempre dia 10 dos meses seguintes."
          ocupado={ocupado}
          aplicar={(d) => executar(() => definirPrimeiroVencimento(negocioId, d), "Datas das parcelas atualizadas.")}
        />

        {/* ------------------------------------ cobrança automática */}
        <div className="border-t pt-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={liberada}
              disabled={ocupado}
              onChange={(e) =>
                executar(
                  () => alternarCobrancaAutomatica(negocioId, e.target.checked),
                  e.target.checked ? "Trilha liberada para cobrança." : "Cobrança automática desligada.",
                )
              }
              className="mt-0.5 size-4"
            />
            <span>
              <span className="font-medium text-foreground">Cobrança automática</span>
              <span className="block text-xs text-muted-foreground">
                Ligada, o sistema gera a parcela no Asaas todo dia 1. Na conta real, também libera o
                botão manual.
              </span>
            </span>
          </label>
        </div>

        {erro ? <Alert>{erro}</Alert> : null}
        {ok ? <Alert tone="ok">{ok}</Alert> : null}
      </div>
    </section>
  );
}

const proximoDia10 = () => {
  const hoje = new Date();
  const alvo = new Date(hoje.getFullYear(), hoje.getMonth() + (hoje.getDate() >= 10 ? 1 : 0), 10);
  return `${alvo.getFullYear()}-${String(alvo.getMonth() + 1).padStart(2, "0")}-10`;
};

const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Um campo de vencimento com os dois atalhos de sempre: hoje ou próximo dia 10. */
function Vencimento({
  id,
  rotulo,
  valor,
  travado,
  motivoTrava,
  atalhoHoje,
  nota,
  ocupado,
  aplicar,
}: {
  id: string;
  rotulo: string;
  valor: string | null;
  travado: boolean;
  motivoTrava: string;
  atalhoHoje: string;
  nota: string;
  ocupado: boolean;
  aplicar: (data: string) => void;
}) {
  const [data, setData] = useState(valor ?? "");

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-muted-foreground">
        {rotulo}
      </label>
      {travado ? (
        <p className="font-medium text-foreground">
          {valor ? new Date(`${valor}T12:00:00`).toLocaleDateString("pt-BR") : "—"}
          <span className="block text-xs font-normal text-muted-foreground">{motivoTrava}</span>
        </p>
      ) : (
        <>
          <div className="flex gap-2">
            <input
              id={id}
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"
            />
            <button
              type="button"
              disabled={ocupado || !data || data === valor}
              onClick={() => aplicar(data)}
              className="h-9 rounded-md border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              Aplicar
            </button>
          </div>
          <div className="mt-1.5 flex gap-3 text-xs">
            <button type="button" onClick={() => setData(hojeISO())} className="text-muted-foreground underline-offset-4 hover:underline">
              {atalhoHoje}
            </button>
            <button type="button" onClick={() => setData(proximoDia10())} className="text-muted-foreground underline-offset-4 hover:underline">
              próximo dia 10
            </button>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">{nota}</p>
        </>
      )}
    </div>
  );
}
