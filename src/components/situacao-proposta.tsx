/**
 * A situação de uma proposta, em uma palavra.
 *
 * `recusada` e `invalidada` têm cores diferentes de propósito: recusada é uma
 * decisão sobre aquela proposta, invalidada é "a unidade foi para outra". Para
 * o corretor que enviou, a diferença entre as duas é tudo — uma diz que ele
 * errou o negócio, a outra diz que ele chegou tarde.
 */
const CORES: Record<string, string> = {
  enviada: "border-border bg-muted text-foreground",
  em_analise: "border-aviso/20 bg-aviso-suave text-aviso",
  aceita: "border-sucesso/20 bg-sucesso-suave text-sucesso",
  recusada: "border-destructive/20 bg-erro-suave text-destructive",
  invalidada: "border-border bg-muted text-muted-foreground",
  cancelada: "border-border bg-muted text-muted-foreground",
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
      className={`inline-block rounded-full border px-2.5 py-0.5 text-sm font-semibold whitespace-nowrap ${
        CORES[status] ?? "border-border bg-muted text-muted-foreground"
      }`}
    >
      {ROTULOS[status] ?? status}
    </span>
  );
}
