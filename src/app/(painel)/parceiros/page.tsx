import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ehAdmin, ehParceiro, getSessao } from "@/lib/sessao";
import { PageHeader } from "@/components/ui";
import ErroLeitura from "@/components/erro-leitura";
import ListaParceiros, { type ParceiroLinha } from "@/components/lista-parceiros";

const CAMPOS =
  "id, nome, documento, creci, email, telefone, ativo, conta_id, convite_token, conta (email)";

/**
 * Os parceiros: corretores e imobiliárias.
 *
 * A mesma rota atende os dois lados, porque a pergunta é a mesma — "quem vende
 * as minhas unidades?" — e só muda o tamanho do "minhas":
 *
 *   incorporadora — os parceiros dela. É o recorte que o banco já faz sozinho.
 *   Trilha        — todos, com a incorporadora de cada um numa coluna.
 *
 * O PARCEIRO TRILHA É UM FILTRO, não outra tela. No banco ele é um `parceiro`
 * com `incorporadora_id` nulo, e a tela separada que existia era esta mesma
 * consulta com um `.is(..., null)` — duas páginas para uma entidade. Quem
 * chega por `/parceiro-trilha` cai aqui com o filtro ligado.
 *
 * Do lado da Trilha a ficha de cada parceiro continua morando sob a
 * incorporadora dele. Esta tela é a porta de entrada por cima; as telas de
 * edição e de acesso são as que já existem.
 *
 * O parceiro não tem esta tela: ele não cadastra ninguém.
 */
const FILTROS = [
  { chave: "todos", label: "Todos" },
  { chave: "incorporadora", label: "De incorporadora" },
  { chave: "trilha", label: "Parceiro Trilha" },
] as const;

export default async function ParceirosPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>;
}) {
  const sessao = await getSessao();
  if (ehParceiro(sessao)) redirect("/empreendimentos");

  const { tipo } = await searchParams;
  const filtro = FILTROS.some((f) => f.chave === tipo) ? tipo! : "todos";

  const supabase = await createClient();
  const admin = ehAdmin(sessao);

  if (!admin && !sessao?.incorporadoraId) {
    return (
      <p className="rounded-md border border-aviso/20 bg-aviso-suave px-5 py-4 text-sm text-aviso">
        Esta conta não está ligada a nenhuma incorporadora.
      </p>
    );
  }

  let consulta = admin
    ? supabase.from("parceiro").select(`${CAMPOS}, incorporadora (id, nome)`).order("nome")
    : supabase
        .from("parceiro")
        .select(CAMPOS)
        .eq("incorporadora_id", sessao!.incorporadoraId!)
        .order("nome");

  // O filtro é só do lado da Trilha: a incorporadora só enxerga os dela, e o
  // banco já recorta isso — oferecer "Parceiro Trilha" para ela seria oferecer
  // uma lista que volta sempre vazia.
  if (admin && filtro === "trilha") consulta = consulta.is("incorporadora_id", null);
  if (admin && filtro === "incorporadora") consulta = consulta.not("incorporadora_id", "is", null);

  const { data, error } = await consulta.returns<ParceiroLinha[]>();

  if (error) return <ErroLeitura oQue={admin ? "dos parceiros" : "dos seus parceiros"} erro={error} />;

  const parceiros = data ?? [];

  return (
    <>
      <PageHeader
        titulo="Parceiros"
        descricao={
          admin
            ? "Imobiliárias e corretores — os de cada incorporadora e os independentes."
            : "Imobiliárias e corretores que vendem as suas unidades."
        }
        // Só do lado da Trilha o rótulo precisa dizer "de incorporadora": é lá
        // que os dois botões convivem. Para a incorporadora não existe o outro
        // tipo, e dizer "de incorporadora" para ela seria dizer o óbvio.
        acao={{
          href: "/parceiros/novo",
          label: admin ? "Cadastrar parceiro de incorporadora" : "Cadastrar parceiro",
        }}
        acaoSecundaria={
          admin ? { href: "/parceiro-trilha/novo", label: "Cadastrar Parceiro Trilha" } : undefined
        }
      />

      {admin ? (
        <div className="mb-5 flex flex-wrap gap-1.5">
          {FILTROS.map((f) => {
            const on = f.chave === filtro;
            return (
              <Link
                key={f.chave}
                href={f.chave === "todos" ? "/parceiros" : `/parceiros?tipo=${f.chave}`}
                aria-current={on ? "page" : undefined}
                className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                  on
                    ? "border-foreground/20 bg-muted font-medium text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.label}
              </Link>
            );
          })}
        </div>
      ) : null}

      <p className="mb-6 max-w-3xl text-sm text-muted-foreground">
        Cada parceiro entra com o próprio login e enxerga{" "}
        <strong className="text-foreground">somente as unidades disponíveis</strong> da incorporadora
        dele, com as condições de pagamento de cada uma. Ele não cadastra nem altera nada — nem
        imóvel, nem empreendimento, nem condição de pagamento.
      </p>

      {/* As fichas ficam todas sob `/parceiros`, inclusive para a Trilha. Antes
          os links dela apontavam para dentro da incorporadora — reaproveitava
          telas prontas, mas mandava o admin para um caminho onde o "voltar"
          levava a outro lugar, e a tela de acesso ainda recusava a Trilha. */}
      <ListaParceiros parceiros={parceiros} base="/parceiros" mostrarIncorporadora={admin} />
    </>
  );
}
