/**
 * A situação de uma proposta, em uma palavra.
 *
 * `recusada` e `invalidada` têm cores diferentes de propósito: recusada é uma
 * decisão sobre aquela proposta, invalidada é "a unidade foi para outra". Para
 * o corretor que enviou, a diferença entre as duas é tudo — uma diz que ele
 * errou o negócio, a outra diz que ele chegou tarde.
 */
const CORES: Record<string, string> = {
  enviada: "border-trilha-200 bg-trilha-100 text-trilha-700",
  em_analise: "border-amber-200 bg-amber-50 text-amber-700",
  aceita: "border-emerald-200 bg-emerald-50 text-emerald-700",
  recusada: "border-red-200 bg-red-50 text-red-700",
  invalidada: "border-slate-200 bg-slate-100 text-slate-600",
  cancelada: "border-slate-200 bg-slate-100 text-slate-600",
};

const ROTULOS: Record<string, string> = {
  enviada: "Enviada",
  em_analise: "Em análise",
  aceita: "Aceita",
  recusada: "Recusada",
  invalidada: "Unidade foi para outra",
  cancelada: "Cancelada",
};

export function SituacaoProposta({ status }: { status: string }) {
  return (
    <span
      className={`font-display inline-block rounded-full border px-2.5 py-0.5 text-sm font-semibold whitespace-nowrap ${
        CORES[status] ?? "border-slate-200 bg-slate-100 text-slate-600"
      }`}
    >
      {ROTULOS[status] ?? status}
    </span>
  );
}
