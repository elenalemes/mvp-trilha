import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ehAdmin, getSessao } from "@/lib/sessao";
import { EmptyState, PageHeader } from "@/components/ui";
import { MarcarTodosLidos, Reenviar } from "@/components/acoes-avisos";
import { cn } from "@/lib/utils";

/**
 * Avisos — o sino por extenso, e o registro de tudo o que saiu por WhatsApp.
 * Só a Trilha.
 *
 *   Avisos     o que aconteceu no sistema (proposta nova, pagamento, problema)
 *   Mensagens  cada WhatsApp para corretor, comprador e vendedor: se saiu,
 *              quando, e o motivo quando não saiu — com botão de reenviar
 */
export const dynamic = "force-dynamic";

const ABAS = [
  { id: "avisos", rotulo: "Avisos" },
  { id: "mensagens", rotulo: "Mensagens" },
] as const;

type Aviso = {
  id: string;
  titulo: string;
  texto: string | null;
  gravidade: "info" | "atencao" | "problema";
  link: string | null;
  created_at: string;
};

type Mensagem = {
  id: string;
  destinatario: string | null;
  destino: string;
  assunto: string;
  texto: string;
  status: "pendente" | "enviando" | "enviada" | "falhou";
  tentativas: number;
  erro: string | null;
  created_at: string;
  enviada_em: string | null;
};

const dataHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "—";

const COR = { info: "bg-muted-foreground/40", atencao: "bg-aviso", problema: "bg-destructive" } as const;

const SITUACAO: Record<Mensagem["status"], { rotulo: string; cor: string }> = {
  pendente: { rotulo: "na fila", cor: "text-muted-foreground" },
  enviando: { rotulo: "enviando", cor: "text-muted-foreground" },
  enviada: { rotulo: "enviada", cor: "text-sucesso" },
  falhou: { rotulo: "não saiu", cor: "text-destructive" },
};

export default async function AvisosPage({ searchParams }: { searchParams: Promise<{ aba?: string; so?: string }> }) {
  const sessao = await getSessao();
  if (!ehAdmin(sessao)) redirect("/");

  const { aba: abaPedida, so } = await searchParams;
  const aba = abaPedida === "mensagens" ? "mensagens" : "avisos";
  const soProblemas = so === "problemas";
  const supabase = await createClient();

  const { count: falhas } = await supabase
    .from("mensagem")
    .select("id", { count: "exact", head: true })
    .eq("status", "falhou");

  return (
    <>
      <PageHeader titulo="Avisos" descricao="O que aconteceu no sistema e cada WhatsApp que ele mandou." />

      <nav className="mb-5 flex flex-wrap gap-1 border-b">
        {ABAS.map((a) => (
          <Link
            key={a.id}
            href={`/avisos?aba=${a.id}`}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm",
              aba === a.id ? "border-foreground font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {a.rotulo}
            {a.id === "mensagens" && falhas ? (
              <span className="ml-1.5 rounded-full bg-erro-suave px-1.5 text-xs text-destructive">{falhas}</span>
            ) : null}
          </Link>
        ))}
      </nav>

      {aba === "avisos" ? <ListaAvisos usuarioId={sessao!.usuarioId} /> : <ListaMensagens soProblemas={soProblemas} />}
    </>
  );
}

async function ListaAvisos({ usuarioId }: { usuarioId: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("aviso")
    .select("id, titulo, texto, gravidade, link, created_at")
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<Aviso[]>();
  const avisos = data ?? [];

  const { data: lidos } = avisos.length
    ? await supabase
        .from("aviso_lido")
        .select("aviso_id")
        .eq("conta_id", usuarioId)
        .in(
          "aviso_id",
          avisos.map((a) => a.id),
        )
    : { data: [] };
  const jaLidos = new Set((lidos ?? []).map((l: { aviso_id: string }) => l.aviso_id));
  const naoLidos = avisos.filter((a) => !jaLidos.has(a.id)).length;

  if (avisos.length === 0) {
    return <EmptyState titulo="Nenhum aviso ainda" texto="Propostas novas, pagamentos e problemas aparecem aqui e no sino." />;
  }

  return (
    <>
      {naoLidos ? (
        <div className="mb-4 flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">{naoLidos} não lido(s).</p>
          <MarcarTodosLidos />
        </div>
      ) : null}
      <ul className="divide-y rounded-xl border bg-card shadow-xs">
        {avisos.map((a) => {
          const lido = jaLidos.has(a.id);
          const corpo = (
            <span className="flex items-start gap-3">
              <span aria-hidden="true" className={cn("mt-1.5 size-2 shrink-0 rounded-full", lido ? "bg-transparent" : COR[a.gravidade])} />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className={cn("text-sm", lido ? "text-muted-foreground" : "font-medium text-foreground")}>{a.titulo}</span>
                {a.texto ? <span className="text-sm whitespace-pre-line text-muted-foreground">{a.texto}</span> : null}
                <span className="text-xs text-muted-foreground">{dataHora(a.created_at)}</span>
              </span>
            </span>
          );
          return (
            <li key={a.id}>
              {a.link ? (
                <Link href={a.link} className="block px-4 py-3 hover:bg-muted/50">
                  {corpo}
                </Link>
              ) : (
                <div className="px-4 py-3">{corpo}</div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

async function ListaMensagens({ soProblemas }: { soProblemas: boolean }) {
  const supabase = await createClient();
  let consulta = supabase
    .from("mensagem")
    .select("id, destinatario, destino, assunto, texto, status, tentativas, erro, created_at, enviada_em")
    .order("created_at", { ascending: false })
    .limit(150);
  if (soProblemas) consulta = consulta.eq("status", "falhou");
  const { data } = await consulta.returns<Mensagem[]>();
  const mensagens = data ?? [];

  return (
    <>
      <div className="mb-4 flex gap-3 text-sm">
        <Link href="/avisos?aba=mensagens" className={soProblemas ? "text-muted-foreground hover:text-foreground" : "font-medium"}>
          Todas
        </Link>
        <Link
          href="/avisos?aba=mensagens&so=problemas"
          className={soProblemas ? "font-medium" : "text-muted-foreground hover:text-foreground"}
        >
          Só as que não saíram
        </Link>
      </div>
      {mensagens.length === 0 ? (
        <EmptyState
          titulo={soProblemas ? "Nenhuma mensagem com problema" : "Nenhuma mensagem ainda"}
          texto="Cada WhatsApp que o sistema manda aparece aqui."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead>
              <tr className="border-b">
                {["Quando", "Para", "Assunto", "Situação", ""].map((h) => (
                  <th key={h} className="bg-muted/50 px-4 py-2.5 text-xs font-medium whitespace-nowrap text-muted-foreground">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mensagens.map((m) => (
                <tr key={m.id} className="border-b align-top last:border-0">
                  <td className="px-4 py-3 text-sm whitespace-nowrap text-muted-foreground">{dataHora(m.created_at)}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className="font-medium">{m.destinatario ?? "—"}</span>
                    <span className="block text-xs text-muted-foreground">{m.destino}</span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <details>
                      <summary className="cursor-pointer">{m.assunto}</summary>
                      <p className="mt-2 max-w-md text-xs whitespace-pre-line text-muted-foreground">{m.texto}</p>
                    </details>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={SITUACAO[m.status].cor}>{SITUACAO[m.status].rotulo}</span>
                    {m.status === "enviada" ? (
                      <span className="block text-xs text-muted-foreground">{dataHora(m.enviada_em)}</span>
                    ) : null}
                    {m.status === "falhou" && m.erro ? (
                      <span className="block max-w-xs text-xs text-muted-foreground">
                        {m.erro} · {m.tentativas} tentativa(s)
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">{m.status === "falhou" || m.status === "pendente" ? <Reenviar id={m.id} /> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
