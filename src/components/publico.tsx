import { cn } from "@/lib/utils";

/**
 * A moldura das páginas públicas: simulador, condições, proposta,
 * acompanhamento, primeiro acesso e login.
 *
 * Mesma base sóbria do painel (branco, cinzas, Geist), com UM elemento de
 * marca: a faixa azul-marinho do topo, com o logo. É o que diz "isto é da
 * Trilha" para quem chega por um link no WhatsApp, sem virar landing page.
 *
 * Na impressão (as condições viram PDF na casa do cliente) a faixa perde o
 * fundo — impressora doméstica não imprime fundo, e o logo continua legível.
 */
export function MolduraPublica({
  contexto,
  largura = "4xl",
  rodape,
  acao,
  children,
}: {
  /** O que é esta página, à direita do logo: "Simulador", "Acompanhamento". */
  contexto?: string;
  largura?: "md" | "2xl" | "4xl" | "6xl";
  rodape?: React.ReactNode;
  /** Botão no canto direito do topo (ex.: "Entrar"). */
  acao?: React.ReactNode;
  children: React.ReactNode;
}) {
  const max = { md: "max-w-md", "2xl": "max-w-2xl", "4xl": "max-w-4xl", "6xl": "max-w-6xl" }[largura];

  return (
    <div className="flex min-h-screen flex-col bg-background print:bg-white">
      <header className="bg-primary text-primary-foreground print:border-b print:bg-white print:text-foreground">
        <div className={cn("mx-auto flex h-14 w-full items-center justify-between gap-4 px-4 sm:px-6", max)}>
          <Marca />
          <div className="flex items-center gap-4">
            {contexto ? (
              <span className="text-sm text-primary-foreground/70 print:text-muted-foreground">{contexto}</span>
            ) : null}
            {acao}
          </div>
        </div>
      </header>

      <main className={cn("mx-auto w-full flex-1 px-4 py-8 sm:px-6 sm:py-10", max)}>{children}</main>

      {rodape ? (
        <footer className={cn("mx-auto w-full px-4 pb-10 text-xs leading-relaxed text-muted-foreground sm:px-6", max)}>
          {rodape}
        </footer>
      ) : null}
    </div>
  );
}

/** O logo: quadrado com o "T" e o nome. Branco sobre a faixa azul-marinho. */
export function Marca() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex size-7 items-center justify-center rounded-md bg-primary-foreground text-sm font-bold text-primary print:border print:border-foreground">
        T
      </span>
      <span className="text-base font-semibold tracking-tight">Trilha</span>
    </span>
  );
}

/** Aviso de "não deu": link vencido, unidade indisponível. Âmbar, não vermelho — não é culpa de quem abriu. */
export function AvisoPublico({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-aviso/20 bg-aviso-suave px-5 py-4 text-sm leading-relaxed text-aviso">
      {children}
    </p>
  );
}

/** Título de página pública: a unidade, e embaixo o que a descreve. */
export function TituloPublico({ titulo, descricao }: { titulo: string; descricao?: string }) {
  return (
    <header className="mb-6 flex flex-col gap-1">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{titulo}</h1>
      {descricao ? <p className="text-sm text-muted-foreground">{descricao}</p> : null}
    </header>
  );
}

/**
 * A tela de entrada (login e primeiro acesso), como na maquete aprovada:
 * painel azul-marinho com a marca à esquerda e o formulário à direita. No
 * celular o painel vira só a faixa do topo.
 */
export function TelaDeEntrada({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen bg-card lg:grid-cols-2">
      <aside className="flex flex-col justify-between bg-primary px-6 py-5 text-primary-foreground lg:px-16 lg:py-14">
        <Marca />
        <div className="hidden max-w-md flex-col gap-4 lg:flex">
          <p className="text-4xl leading-tight font-semibold tracking-tight">
            Uma nova forma de negociar imóveis prontos.
          </p>
          <p className="text-base leading-relaxed text-primary-foreground/70">
            Mais fácil para quem compra. Mais rápido para quem vende.
          </p>
        </div>
        <span className="hidden text-sm text-primary-foreground/60 lg:block">trilha.online</span>
      </aside>
      <main className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
