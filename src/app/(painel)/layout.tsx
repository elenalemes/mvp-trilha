import Link from "next/link";
import { getSessao } from "@/lib/sessao";
import { signOut } from "@/app/actions/auth";
import { NavLateral } from "@/components/nav-lateral";

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const sessao = await getSessao();
  const admin = sessao?.conta?.tipo === "trilha_admin";
  const parceiro = sessao?.conta?.tipo === "parceiro";

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

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="flex shrink-0 flex-col gap-6 border-b border-trilha-200 bg-white px-5 py-6 lg:min-h-screen lg:w-60 lg:border-r lg:border-b-0">
        <div className="flex items-baseline gap-2.5">
          <span className="font-display text-lg font-bold tracking-wide text-trilha-700">
            TRILHA
          </span>
          <span className="font-display rounded bg-trilha-100 px-2 py-0.5 text-xs font-semibold tracking-[0.12em] text-trilha-700 uppercase">
            {admin ? "Admin" : parceiro ? "Parceiro" : "Incorporadora"}
          </span>
        </div>

        <NavLateral links={links} />

        {/* Atalho, não item de menu: o corretor sai do painel e vai para a
            página que ele mostra ao cliente. Por isso é redondo, sólido e
            separado dos demais — e abre em outra aba, para ele não perder
            onde estava. */}
        {parceiro ? (
          <Link
            href="/simulador"
            target="_blank"
            rel="noopener noreferrer"
            className="font-display flex items-center justify-center gap-2 rounded-full bg-trilha-500 px-4 py-2.5 text-[15px] font-semibold tracking-wide text-white transition-colors hover:bg-trilha-700"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-[18px] shrink-0"
              aria-hidden="true"
            >
              <path d="M14 4h6v6M20 4l-8.5 8.5M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
            </svg>
            Simulador
          </Link>
        ) : null}

        <div className="mt-auto flex flex-col gap-3 border-t border-trilha-100 pt-4">
          <div className="flex flex-col">
            <span className="truncate text-[15px] font-medium text-trilha-900" title={sessao?.email}>
              {sessao?.conta?.nome ?? sessao?.email}
            </span>
            {sessao?.conta?.nome ? (
              <span className="truncate text-xs text-trilha-400" title={sessao?.email}>
                {sessao?.email}
              </span>
            ) : null}
          </div>

          {!admin && !parceiro ? (
            <Link
              href="/perfil"
              className="font-display flex items-center gap-2 rounded-md px-1 py-1 text-[15px] font-semibold tracking-wide text-trilha-500 underline underline-offset-2 transition-colors hover:text-trilha-700"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-[18px]"
                aria-hidden="true"
              >
                <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 20a7 7 0 0 1 14 0" />
              </svg>
              Meus dados
            </Link>
          ) : null}

          <form action={signOut}>
            <button
              type="submit"
              className="font-display flex w-full items-center justify-center gap-2 rounded-md border border-trilha-200 bg-white px-4 py-2 text-[15px] font-semibold tracking-wide text-trilha-700 transition-colors hover:border-trilha-500 hover:bg-trilha-50"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-[18px]"
                aria-hidden="true"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
              Sair
            </button>
          </form>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-6 py-10 lg:px-10">
        <div className="mx-auto max-w-4xl">
          {sessao && !sessao.conta ? (
            <div className="mb-8 flex flex-col gap-2 rounded-md border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
              {sessao.erroLeitura ? (
                <>
                  <strong className="font-semibold">O banco recusou a leitura da sua ficha.</strong>
                  <span>
                    A linha pode até existir — o banco não deixou ler. Isso é permissão ou regra de
                    acesso, não dado faltando.
                  </span>
                  <code className="rounded bg-amber-100 px-2 py-1 font-mono text-xs break-all">
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
                    <code className="rounded bg-amber-100 px-1">supabase/sprint-1.sql</code>.
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
      </main>
    </div>
  );
}
