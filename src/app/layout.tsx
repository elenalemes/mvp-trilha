import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// Geist no texto inteiro, Geist Mono nos poucos lugares em que alinhar número
// por coluna importa. `next/font` baixa as fontes no build e serve do próprio
// domínio: sem ir ao Google em cada visita, e sem o texto "piscar" ao trocar
// de fonte.
const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: "Trilha · Incorporadoras",
  description: "Painel da Trilha para cadastro e gestão de incorporadoras parceiras.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${geist.variable} ${geistMono.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
