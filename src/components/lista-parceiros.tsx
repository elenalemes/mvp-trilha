import Link from "next/link";
import { maskCNPJ, maskCPF, maskPhone } from "@/lib/br";
import { EmptyState } from "@/components/ui";

export type ParceiroLinha = {
  id: string;
  nome: string;
  documento: string | null;
  creci: string | null;
  email: string;
  telefone: string;
  ativo: boolean;
  conta_id: string | null;
  conta: { email: string | null } | null;
  /** Presente = convite de primeiro acesso em aberto, ainda não usado. */
  convite_token?: string | null;
  /** Só vem preenchido na lista geral da Trilha. */
  incorporadora?: { id: string; nome: string } | null;
};

/** CPF e CNPJ moram na mesma coluna: a máscara sai do tamanho. */
const documentoFormatado = (v: string | null) =>
  !v ? "—" : v.length > 11 ? maskCNPJ(v) : maskCPF(v);

/**
 * A mesma tabela serve à Trilha e à incorporadora. `base` diz sob qual rota as
 * fichas vivem — `/parceiros` nos dois menus, `/incorporadoras/<id>/parceiros`
 * quando se chega pela ficha de uma incorporadora.
 */
export default function ListaParceiros({
  parceiros,
  base,
  mostrarIncorporadora = false,
}: {
  parceiros: ParceiroLinha[];
  base: string;
  mostrarIncorporadora?: boolean;
}) {
  if (parceiros.length === 0) {
    return (
      <EmptyState
        titulo="Nenhum parceiro cadastrado"
        texto="Cadastre imobiliárias e corretores que vendem estas unidades."
        acao={{ href: `${base}/novo`, label: "Cadastrar o primeiro" }}
      />
    );
  }

  const colunas = mostrarIncorporadora
    ? ["Parceiro", "Incorporadora", "CPF / CNPJ", "Contato", "Acesso", "Situação", ""]
    : ["Parceiro", "CPF / CNPJ", "Contato", "Acesso", "Situação", ""];

  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
      <table
        className={`w-full border-collapse text-left ${mostrarIncorporadora ? "min-w-[980px]" : "min-w-[820px]"}`}
      >
        <thead>
          <tr className="border-b border-border">
            {colunas.map((h, i) => (
              <th
                key={`${h}-${i}`}
                className="bg-muted/50 px-4 py-2.5 text-xs font-medium whitespace-nowrap text-muted-foreground"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {parceiros.map((p) => {
            const rota = base;
            return (
              <tr key={p.id} className="border-b border-border transition-colors last:border-0 hover:bg-muted/40">
                <td className="px-4 py-3">
                  <Link
                    href={`${rota}/${p.id}/editar`}
                    className="text-sm font-semibold text-foreground underline-offset-4 hover:underline hover:text-foreground"
                  >
                    {p.nome}
                  </Link>
                  {p.creci ? <span className="block text-sm text-muted-foreground">{p.creci}</span> : null}
                </td>

                {mostrarIncorporadora ? (
                  <td className="px-4 py-3 text-sm">
                    {p.incorporadora ? (
                      <Link
                        href={`/incorporadoras/${p.incorporadora.id}`}
                        className="text-foreground underline-offset-4 hover:underline hover:text-foreground"
                      >
                        {p.incorporadora.nome}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground/70">—</span>
                    )}
                  </td>
                ) : null}

                <td className="px-4 py-3 text-sm tabular-nums text-muted-foreground">
                  {documentoFormatado(p.documento)}
                </td>
                <td className="px-4 py-3 text-sm">
                  {p.email}
                  <span className="block text-sm tabular-nums text-muted-foreground">
                    {maskPhone(p.telefone)}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {/* Sem conta_id não há login. Com conta_id mas sem e-mail legível,
                      o acesso existe e quem está olhando é que não pode lê-lo. */}
                  {p.conta_id
                    ? (p.conta?.email ?? "acesso criado")
                    : p.convite_token
                      ? "convite enviado, não usado"
                      : "sem acesso criado"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block rounded-full border px-2.5 py-0.5 text-sm font-semibold ${
                      p.ativo
                        ? "border-sucesso/20 bg-sucesso-suave text-sucesso"
                        : "border-border bg-muted text-muted-foreground"
                    }`}
                  >
                    {p.ativo ? "Ativo" : "Inativo"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <Link
                    href={`${rota}/${p.id}/acesso`}
                    className={`text-sm font-semibold underline-offset-4 hover:underline hover:text-foreground ${
                      p.conta_id ? "text-foreground" : "text-aviso"
                    }`}
                  >
                    {/* Três situações, três rótulos. Um "Acesso" genérico
                        escondia a diferença entre quem já entra, quem tem
                        convite esperando e quem não tem caminho nenhum — e é
                        justamente essa diferença que diz o que fazer. */}
                    {p.conta_id
                      ? "Acesso"
                      : p.convite_token
                        ? "Convite pendente"
                        : "Criar acesso"}
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
