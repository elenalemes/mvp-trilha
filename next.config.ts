import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // O padrão do Next é 1 MB, e uma tabela de estoque em PDF passa disso
      // fácil — sem esta linha o upload falha antes de chegar na ação.
      //
      // O teto NÃO é escolha nossa: a Vercel corta o corpo da requisição por
      // volta de 4,5 MB, e nada que configurarmos aqui muda isso. Deixar 25 MB
      // só fazia o erro chegar como falha genérica de rede em vez de mensagem
      // explicando o problema. A ação recusa acima de 4 MB, e esta folga é
      // para o cabeçalho do multipart.
      bodySizeLimit: "4.5mb",
    },
  },
};

export default nextConfig;
