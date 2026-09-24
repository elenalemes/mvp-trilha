import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessao } from "@/lib/sessao";
import { maritalLabel, maskCNPJ, maskCPF, maskPhone, pixTypeLabel } from "@/lib/br";
import { PageHeader, Stat } from "@/components/ui";
import ListaOpcoes from "@/components/lista-opcoes";
import { opcoesPadrao } from "@/lib/opcoes";

type Incorporadora = {
  id: string;
  nome: string;
  cnpj: string;
  email: string;
  telefone: string;
  endereco: string | null;
  resp_nome: string;
  resp_cpf: string;
  resp_rg: string | null;
  resp_profissao: string | null;
  resp_cargo: string | null;
  resp_estado_civil: string | null;
  resp_email: string;
  resp_telefone: string;
  resp_endereco: string | null;
  banco: string | null;
  agencia: string | null;
  conta_numero: string | null;
  chave_pix: string | null;
  chave_pix_tipo: string | null;
  percentual_comissao: number;
  conta: { email: string | null } | null;
};



function Item({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-semibold text-muted-foreground">
        {label}
      </span>
      <span className="text-sm text-foreground">{valor}</span>
    </div>
  );
}

function Card({
  titulo,
  acao,
  children,
}: {
  titulo: string;
  acao?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card p-6 shadow-xs">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <h2 className="text-xl font-semibold text-foreground">{titulo}</h2>
        {acao ? (
          <Link
            href={acao.href}
            className="rounded-md border border-border bg-card px-3.5 py-1.5 text-sm font-semibold text-foreground transition-colors hover:border-foreground/30 hover:bg-accent"
          >
            {acao.label}
          </Link>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}


/**
 * "Não existe" e "não consigo ler" são coisas diferentes, e confundir as duas
 * já custou rodadas de conserto no lugar errado nesta base. Erro do banco vira
 * mensagem na tela com código e motivo; ausência de linha vira 404.
 */
function ErroDeLeitura({ erro }: { erro: { code?: string; message?: string } }) {
  return (
    <div className="rounded-lg border border-destructive/20 bg-erro-suave px-5 py-4">
      <p className="text-sm font-semibold text-destructive">
        Não consegui carregar os dados desta incorporadora.
      </p>
      <p className="mt-1 text-sm text-destructive">
        {erro.code ?? "sem código"}: {erro.message ?? "sem mensagem"}
      </p>
      <p className="mt-2 text-sm text-destructive">
        Recarregue a página. Se continuar, envie este código para a Trilha.
      </p>
    </div>
  );
}

export default async function IncorporadoraPage({ params }: { params: Promise<{ id: string }> }) {
  const sessao = await getSessao();
  if (sessao?.conta && sessao.conta.tipo !== "trilha_admin") redirect("/empreendimentos");

  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("incorporadora")
    .select(
      `id, nome, cnpj, email, telefone, endereco,
       resp_nome, resp_cpf, resp_rg, resp_profissao, resp_cargo, resp_estado_civil,
       resp_email, resp_telefone, resp_endereco,
       banco, agencia, conta_numero, chave_pix, chave_pix_tipo, percentual_comissao,
       conta (email)`,
    )
    .eq("id", id)
    .maybeSingle<Incorporadora>();

  if (error) return <ErroDeLeitura erro={error} />;
  if (!data) notFound();

  const { data: empreendimentos } = await supabase
    .from("empreendimento")
    .select("id")
    .eq("incorporadora_id", id)
    .returns<{ id: string }[]>();

  const ids = (empreendimentos ?? []).map((e) => e.id);

  // Do lado da Trilha as opções vivem aqui, e não no menu: é nesta ficha que
  // se sabe de qual incorporadora estamos falando.
  const padrao = await opcoesPadrao(supabase, id);

  const { data: parceiros } = await supabase
    .from("parceiro")
    .select("id, nome, ativo")
    .eq("incorporadora_id", id)
    .order("nome")
    .returns<{ id: string; nome: string; ativo: boolean }[]>();

  const { count: totalImoveis } = ids.length
    ? await supabase
        .from("imovel")
        .select("id", { count: "exact", head: true })
        .in("empreendimento_id", ids)
    : { count: 0 };

  return (
    <>
      <PageHeader
        titulo={data.nome}
        descricao={maskCNPJ(data.cnpj)}
        voltar={{ href: "/incorporadoras", label: "Incorporadoras" }}
        acaoSecundaria={{ href: `/incorporadoras/${id}/acesso`, label: "Alterar acesso" }}
        acao={{ href: `/incorporadoras/${id}/editar`, label: "Editar cadastro" }}
      />

      <div className="mb-6 grid grid-cols-2 gap-3">
        <Stat
          href={`/empreendimentos?incorporadora=${id}`}
          valor={ids.length}
          label="Empreendimentos"
        />
        <Stat valor={totalImoveis ?? 0} label="Imóveis" />
      </div>

      <div className="flex flex-col gap-6">
        <Card titulo="Dados da incorporadora">
          <Item label="E-mail corporativo" valor={data.email} />
          <Item label="Telefone" valor={maskPhone(data.telefone)} />
          <div className="sm:col-span-2">
            <Item label="Endereço" valor={data.endereco || "—"} />
          </div>
        </Card>

        <Card
          titulo="Opções de pagamento"
          acao={{
            href: `/incorporadoras/${id}/opcoes-pagamento`,
            label: padrao.length ? "Editar padrão" : "Definir padrão",
          }}
        >
          <div className="sm:col-span-2">
            <ListaOpcoes opcoes={padrao} percentualComissao={data.percentual_comissao} />
            <p className="mt-4 text-sm text-muted-foreground">
              Vale para todos os empreendimentos sem condições próprias.
            </p>
          </div>
        </Card>

        <Card
          titulo="Parceiros imobiliários"
          acao={{
            href: `/incorporadoras/${id}/parceiros`,
            label: (parceiros?.length ?? 0) > 0 ? "Ver parceiros" : "Cadastrar parceiro",
          }}
        >
          <div className="sm:col-span-2">
            {(parceiros?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum parceiro cadastrado.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {parceiros!.map((p) => (
                  <li key={p.id} className="flex items-baseline gap-2.5 text-sm">
                    <span className="text-foreground">{p.nome}</span>
                    {p.ativo ? null : (
                      <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                        inativo
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card
          titulo="Acesso"
          acao={{ href: `/incorporadoras/${id}/acesso`, label: "Alterar acesso" }}
        >
          <Item label="E-mail de login" valor={data.conta?.email ?? "sem acesso criado"} />
          <Item label="Senha" valor="não pode ser consultada, só substituída" />
        </Card>

        <Card titulo="Dados bancários">
          <Item label="Banco" valor={data.banco || "—"} />
          <Item
            label="Agência / Conta"
            valor={
              data.agencia || data.conta_numero
                ? `${data.agencia ?? "—"} / ${data.conta_numero ?? "—"}`
                : "—"
            }
          />
          <Item label="Tipo de chave" valor={pixTypeLabel(data.chave_pix_tipo)} />
          <Item label="Chave PIX" valor={data.chave_pix || "—"} />
        </Card>

        <Card titulo="Responsável">
          <Item label="Nome" valor={data.resp_nome} />
          <Item label="CPF" valor={maskCPF(data.resp_cpf)} />
          <Item label="RG" valor={data.resp_rg || "—"} />
          <Item label="Profissão" valor={data.resp_profissao || "—"} />
          <Item label="Cargo" valor={data.resp_cargo || "—"} />
          <Item label="Estado civil" valor={maritalLabel(data.resp_estado_civil)} />
          <Item label="E-mail" valor={data.resp_email} />
          <Item label="Telefone" valor={maskPhone(data.resp_telefone)} />
          <div className="sm:col-span-2">
            <Item label="Endereço" valor={data.resp_endereco || "—"} />
          </div>
        </Card>
      </div>
    </>
  );
}
