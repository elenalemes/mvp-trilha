import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // O padrão é 1 MB, e a tabela do Soul sozinha tem 1,1 MB. Sem isto o
      // upload falha antes de chegar na ação. A ação recusa acima de 20 MB;
      // a folga aqui é para o cabeçalho do multipart.
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
