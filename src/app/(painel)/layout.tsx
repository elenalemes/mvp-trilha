import { cookies } from "next/headers";
import { getSessao } from "@/lib/sessao";
import { NavLateral } from "@/components/nav-lateral";
import { Migalhas } from "@/components/migalhas";
import { Separator } from "@/components/shadcn/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/shadcn/sidebar";

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const sessao = await getSessao();
  const admin = sessao?.conta?.tipo === "trilha_admin";
  const parceiro = sessao?.conta?.tipo === "parceiro";
  const parceiroTrilha = parceiro && Boolean(sessao?.parceiroTrilha);
  const proprietarioPF = sessao?.conta?.tipo === "incorporadora" && Boolean(sessao?.proprietarioPF);

  // O menu principal é só de produto. O que é da conta — nome, e-mail,
  // meus dados e sair — fica no rodapé, separado de propósito.
  // O imóvel também não tem item próprio: ele vive dentro do empreendimento.
  // A incorporadora tem item próprio porque só lida com as opções dela. Para o
  // admin isso não teria contexto — "opções de qual incorporadora?" —, então
  // do lado da Trilha elas vivem na ficha de cada incorporadora.
  // "Parceiros", ao contrário das opções, faz sentido nos dois lados: "todos os
  // parceiros" é pergunta legítima da Trilha, e a coluna da incorporadora dá o
  // contexto que falta. A ficha de cada um segue morando sob a incorporadora
  // dele — o item de menu é porta de entrada, não uma segunda casa.
  // O parceiro imobiliário só enxerga o estoque. Nada de opções de pagamento
  // no menu: ele não define nem edita condição nenhuma, e um item que só
  // mostra o que não é dele para editar seria promessa falsa.
  const links = admin
    ? [
        { href: "/propostas", label: "Propostas", icone: "proposta" as const },
        { href: "/negocios", label: "Setups de negócios", icone: "chave" as const },
        { href: "/importacao", label: "Importação de estoque", icone: "importar" as const },
        { href: "/incorporadoras", label: "Incorporadoras", icone: "empresa" as const },
        { href: "/empreendimentos", label: "Empreendimentos", icone: "predio" as const },
        { href: "/parceiros", label: "Parceiros imobiliários", icone: "parceiros" as const },
        { href: "/parceiro-trilha", label: "Parceiro Trilha", icone: "trilha" as const },
        { href: "/proprietarios", label: "Proprietários PF", icone: "casa" as const },
      ]
    : proprietarioPF
      ? [
          { href: `/proprietarios/${sessao!.incorporadoraId}`, label: "Meus imóveis", icone: "casa" as const },
          { href: "/negocios", label: "Setups de negócios", icone: "chave" as const },
        ]
    : parceiroTrilha
      ? [
          // Sem incorporadora, não há "estoque dele" no painel: o estoque de
          // todas está no simulador, que fica no atalho do menu.
          { href: "/propostas", label: "Minhas propostas", icone: "proposta" as const },
          { href: "/negocios", label: "Setups de negócios", icone: "chave" as const },
        ]
    : parceiro
      ? [
          { href: "/empreendimentos", label: "Empreendimentos", icone: "predio" as const },
          { href: "/propostas", label: "Minhas propostas", icone: "proposta" as const },
          { href: "/negocios", label: "Setups de negócios", icone: "chave" as const },
        ]
      : [
          { href: "/empreendimentos", label: "Empreendimentos", icone: "predio" as const },
          { href: "/negocios", label: "Setups de negócios", icone: "chave" as const },
          { href: "/opcoes-pagamento", label: "Opções de pagamento", icone: "pagamento" as const },
          { href: "/parceiros", label: "Parceiros imobiliários", icone: "parceiros" as const },
        ];

  // O menu recolhido ou aberto fica num cookie, lido aqui para a página já
  // nascer no estado certo — sem o menu "pular" ao carregar.
  const menuAberto = (await cookies()).get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider defaultOpen={menuAberto}>
      <NavLateral
        links={links}
        papel={
          admin
            ? "Painel da Trilha"
            : parceiroTrilha
              ? "Parceiro Trilha"
              : proprietarioPF
                ? "Proprietário"
              : parceiro
                ? "Parceiro imobiliário"
                : "Incorporadora"
        }
        nome={sessao?.conta?.nome ?? ""}
        email={sessao?.email ?? ""}
        mostrarPerfil={!admin && !parceiro}
        mostrarSimulador={parceiro}
      />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur lg:px-6">
          <SidebarTrigger className="-ml-1 text-muted-foreground" />
          <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-4" />
          <Migalhas />
        </header>
      {/* `SidebarInset` já é o <main> da página; aqui é só o miolo. */}
      <div className="min-w-0 flex-1 px-4 py-8 lg:px-8">
        <div className="mx-auto max-w-6xl">
          {sessao && !sessao.conta ? (
            <div className="mb-8 flex flex-col gap-2 rounded-md border border-aviso/20 bg-aviso-suave px-5 py-4 text-sm text-aviso">
              {sessao.erroLeitura ? (
                <>
                  <strong className="font-semibold">Não consegui carregar os dados da sua ficha.</strong>
                  <span>
                    A linha pode até existir — o banco não deixou ler. Isso é permissão ou regra de
                    acesso, não dado faltando.
                  </span>
                  <code className="rounded bg-aviso/10 px-2 py-1 font-mono text-xs break-all">
                    {sessao.erroLeitura}
                  </code>
                </>
              ) : (
                <>
                  <strong className="font-semibold">
                    Este login não tem ficha na tabela conta.
                  </strong>
                  <span>
                    O banco respondeu sem erro, mas não encontrou nenhuma linha para este usuário.
                    Rode a Parte 7 do arquivo{" "}
                    <code className="rounded bg-aviso/10 px-1">supabase/sprint-1.sql</code>.
                  </span>
                </>
              )}
              <span className="text-xs opacity-80">
                usuário logado: {sessao.email} · id {sessao.usuarioId}
              </span>
              <span className="text-xs opacity-80">
                identidade que o banco recebeu:{" "}
                {sessao.uidNoBanco ?? "NENHUMA — o app está chegando como anônimo"}
              </span>
              <span className="text-xs opacity-80">
                token de sessão:{" "}
                {sessao.token.presente
                  ? `presente · papel "${sessao.token.role ?? "sem papel"}" · sub ${sessao.token.sub ?? "vazio"}`
                  : "AUSENTE — o cliente não carregou a sessão dos cookies"}
              </span>
            </div>
          ) : null}
          {children}
        </div>
      </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
