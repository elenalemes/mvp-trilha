"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Icone = "empresa" | "predio" | "chave" | "pagamento" | "importar" | "parceiros" | "proposta";

const CAMINHOS: Record<Icone, string> = {
  empresa: "M3 21h18M5 21V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v16M13 9h5a1 1 0 0 1 1 1v11M8 8h2M8 12h2M8 16h2M16 13h1M16 17h1",
  predio: "M4 21h16M6 21V7l6-4 6 4v14M10 11h1M10 15h1M14 11h1M14 15h1M11 21v-4h2v4",
  chave: "M15 7a4 4 0 1 1-3.87 5H7v3H4v-3H2.5l3.6-3.6A4 4 0 0 1 15 7Zm1.5 2.5h.01",
  pagamento: "M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Zm0 3h18M7 15h4",
  importar: "M12 3v11m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2",
  parceiros: "M15 19.5a3.5 3.5 0 0 0-7 0M11.5 12.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM21 18.5a3 3 0 0 0-3.3-2.6M17.2 12.2a2.5 2.5 0 0 0 .3-5",
  proposta: "M7 4a1 1 0 0 1 1-1h5l4 4v13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4Zm6-1v4h4M9.5 13.5l2 2 3.5-3.5",
};

function Icone({ nome }: { nome: Icone }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-[18px] shrink-0"
      aria-hidden="true"
    >
      <path d={CAMINHOS[nome]} />
    </svg>
  );
}

export function NavLateral({
  links,
}: {
  links: { href: string; label: string; icone: Icone }[];
}) {
  const caminho = usePathname();

  return (
    <nav className="flex flex-row gap-1 overflow-x-auto lg:flex-col">
      {links.map((link) => {
        const ativo = caminho === link.href || caminho.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={ativo ? "page" : undefined}
            className={`font-display flex items-center gap-2.5 rounded-md px-3 py-2 text-[15px] font-semibold tracking-wide whitespace-nowrap transition-colors ${
              ativo
                ? "bg-trilha-100 text-trilha-700"
                : "text-trilha-500 hover:bg-trilha-50 hover:text-trilha-700"
            }`}
          >
            <Icone nome={link.icone} />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
