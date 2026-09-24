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
    <div className="rounded-lg border border-destructive/20 bg-erro-suave px-5 py-4">
      <p className="text-sm font-semibold text-destructive">
        Não consegui carregar os dados {oQue}.
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
