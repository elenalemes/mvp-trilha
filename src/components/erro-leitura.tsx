/**
 * "Não existe" e "não consigo ler" são coisas diferentes, e confundir as duas
 * já custou rodadas de conserto no lugar errado nesta base. Erro do banco vira
 * mensagem na tela com código e motivo; ausência de linha vira 404.
 */
export default function ErroLeitura({
  oQue,
  erro,
}: {
  /** Ex.: "deste parceiro", "desta incorporadora". */
  oQue: string;
  erro: { code?: string; message?: string };
}) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-4">
      <p className="font-display text-[15px] font-semibold text-red-800">
        O banco recusou a leitura {oQue}.
      </p>
      <p className="mt-1 text-sm text-red-700">
        {erro.code ?? "sem código"}: {erro.message ?? "sem mensagem"}
      </p>
      <p className="mt-2 text-sm text-red-700">
        Isso não quer dizer que o cadastro não exista — quer dizer que esta sessão não conseguiu
        lê-lo.
      </p>
    </div>
  );
}
