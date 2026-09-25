import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ehAdmin, ehProprietarioPF, getSessao } from "@/lib/sessao";
import {
  formatBRL,
  imovelStatusLabel,
  imovelTipoLabel,
  maritalLabel,
  maskCPF,
  maskPhone,
} from "@/lib/br";
import { EmptyState, PageHeader } from "@/components/ui";
import ErroLeitura from "@/components/erro-leitura";

type Imovel = {
  id: string;
  identificacao: string;
  tipo: string;
  status: string;
  valor: number | null;
  num_quartos: number | null;
  num_vagas: number | null;
};

type Registro = {
  id: string;
  resp_nome: string;
  resp_cpf: string;
  resp_rg: string | null;
  resp_email: string;
  resp_telefone: string;
  resp_endereco: string | null;
  resp_profissao: string | null;
  resp_estado_civil: string | null;
  banco: string | null;
  agencia: string | null;
  conta_numero: string | null;
  chave_pix: string | null;
  conta_id: string | null;
  empreendimento: { id: string; nome: string; endereco: string | null; imovel: Imovel[] }[];
};

/**
 * A ficha do proprietário PF: os dados dele e os imóveis, agrupados pelo
 * condomínio/edifício. A Trilha edita; o próprio proprietário só consulta
 * (os dados dele, ele muda em "Meus dados").
 */
export default async function ProprietarioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sessao = await getSessao();
  const admin = ehAdmin(sessao);
  if (!admin && !(ehProprietarioPF(sessao) && sessao?.incorporadoraId === id)) redirect("/");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("incorporadora")
    .select(
      `id, resp_nome, resp_cpf, resp_rg, resp_email, resp_telefone, resp_endereco, resp_profissao,
       resp_estado_civil, banco, agencia, conta_numero, chave_pix, conta_id,
       empreendimento (id, nome, endereco,
         imovel (id, identificacao, tipo, status, valor, num_quartos, num_vagas))`,
    )
    .eq("id", id)
    .eq("tipo", "proprietario_pf")
    .maybeSingle<Registro>();

  if (error) return <ErroLeitura oQue="deste proprietário" erro={error} />;
  if (!data) notFound();

  const locais = [...data.empreendimento].sort((a, b) => a.nome.localeCompare(b.nome));
  const banco = [data.banco, data.agencia && `ag. ${data.agencia}`, data.conta_numero && `c/c ${data.conta_numero}`]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <PageHeader
        titulo={admin ? data.resp_nome : "Meus imóveis"}
        descricao={admin ? "Proprietário PF" : undefined}
        voltar={admin ? { href: "/proprietarios", label: "Proprietários PF" } : undefined}
        acao={admin ? { href: `/proprietarios/${id}/imoveis/novo`, label: "Cadastrar imóvel" } : undefined}
        acaoSecundaria={admin ? { href: `/proprietarios/${id}/editar`, label: "Editar dados" } : undefined}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="flex flex-col gap-6">
          {locais.length === 0 ? (
            <EmptyState
              titulo="Nenhum imóvel ainda"
              texto={admin ? "Cadastre o imóvel que ele quer vender." : "A Trilha cadastra os seus imóveis."}
              acao={admin ? { href: `/proprietarios/${id}/imoveis/novo`, label: "Cadastrar imóvel" } : undefined}
            />
          ) : (
            locais.map((l) => (
              <section key={l.id} className="overflow-hidden rounded-xl border bg-card shadow-xs">
                <header className="flex flex-wrap items-baseline justify-between gap-2 border-b bg-muted/40 px-5 py-3">
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">{l.nome}</h2>
                    {l.endereco ? <p className="text-sm text-muted-foreground">{l.endereco}</p> : null}
                  </div>
                  {admin ? (
                    <div className="flex gap-4 text-sm">
                      <Link
                        href={`/proprietarios/${id}/locais/${l.id}/editar`}
                        className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                      >
                        Editar local
                      </Link>
                      <Link
                        href={`/proprietarios/${id}/imoveis/novo?e=${l.id}`}
                        className="font-semibold text-foreground underline-offset-4 hover:underline"
                      >
                        + Imóvel aqui
                      </Link>
                    </div>
                  ) : null}
                </header>
                {l.imovel.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-muted-foreground">Nenhum imóvel neste local.</p>
                ) : (
                  <ul>
                    {l.imovel.map((i) => (
                      <li
                        key={i.id}
                        className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3 last:border-0"
                      >
                        <div>
                          <p className="text-sm font-semibold text-foreground">{i.identificacao}</p>
                          <p className="text-sm text-muted-foreground">
                            {[
                              imovelTipoLabel(i.tipo),
                              i.num_quartos ? `${i.num_quartos} dorm.` : null,
                              i.num_vagas ? `${i.num_vagas} vaga(s)` : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <span className="tabular-nums text-foreground">
                            {i.valor ? formatBRL(i.valor) : admin ? "Sem valor — preencha para negociar" : "—"}
                          </span>
                          <span className="text-muted-foreground">{imovelStatusLabel(i.status)}</span>
                          {admin ? (
                            <Link
                              href={`/proprietarios/${id}/imoveis/${i.id}/editar`}
                              className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                            >
                              Editar
                            </Link>
                          ) : null}
                          {/* Negociar pede unidade disponível e com valor — a mesma
                              regra da Nova negociação. */}
                          {admin && i.status === "disponivel" && i.valor ? (
                            <Link
                              href={`/negocios/novo?e=${l.id}&u=${i.id}`}
                              className="font-semibold text-foreground underline-offset-4 hover:underline"
                            >
                              Nova negociação
                            </Link>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))
          )}
        </div>

        <aside className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-xs lg:sticky lg:top-20">
          <h2 className="text-sm font-semibold text-foreground">Dados do proprietário</h2>
          <dl className="flex flex-col gap-3 text-sm">
            <Dado termo="Nome" valor={data.resp_nome} />
            <Dado termo="CPF" valor={maskCPF(data.resp_cpf)} />
            <Dado termo="RG" valor={data.resp_rg} />
            <Dado termo="Estado civil" valor={maritalLabel(data.resp_estado_civil)} />
            <Dado termo="Profissão" valor={data.resp_profissao} />
            <Dado termo="E-mail" valor={data.resp_email} />
            <Dado termo="Telefone" valor={maskPhone(data.resp_telefone)} />
            <Dado termo="Endereço" valor={data.resp_endereco} />
            <Dado termo="Banco" valor={banco || null} />
            <Dado termo="Pix" valor={data.chave_pix} />
          </dl>
          {admin ? (
            <Link
              href={`/proprietarios/${id}/acesso`}
              className="text-sm font-semibold text-foreground underline-offset-4 hover:underline"
            >
              {data.conta_id ? "Dados de acesso" : "Sem acesso criado"}
            </Link>
          ) : (
            <Link href="/perfil" className="text-sm font-semibold text-foreground underline-offset-4 hover:underline">
              Editar meus dados
            </Link>
          )}
        </aside>
      </div>
    </>
  );
}

function Dado({ termo, valor }: { termo: string; valor: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{termo}</dt>
      <dd className="text-foreground">{valor || "—"}</dd>
    </div>
  );
}
