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
  /** Só vem preenchido na lista geral da Trilha. */
  incorporadora?: { id: string; nome: string } | null;
};

/** CPF e CNPJ moram na mesma coluna: a máscara sai do tamanho. */
const documentoFormatado = (v: string | null) =>
  !v ? "—" : v.length > 11 ? maskCNPJ(v) : maskCPF(v);

/**
 * A mesma tabela serve à Trilha e à incorporadora.
 *
 * `base` é onde nasce um parceiro novo. `fichaDe` é onde vive a ficha de cada
 * linha — existe porque na lista geral da Trilha cada parceiro mora sob a
 * incorporadora dele (`/incorporadoras/<id>/parceiros/<parceiroId>`), e essas
 * telas já funcionam. Reaproveitá-las custa uma função aqui; duplicá-las
 * custaria um segundo lugar para errar permissão.
 *
 * Sem `fichaDe`, a ficha fica sob a própria `base` — o caso da incorporadora
 * olhando os parceiros dela.
 */
export default function ListaParceiros({
  parceiros,
  base,
  fichaDe,
  mostrarIncorporadora = false,
}: {
  parceiros: ParceiroLinha[];
  base: string;
  fichaDe?: (p: ParceiroLinha) => string;
  mostrarIncorporadora?: boolean;
}) {
  const rotaDa = fichaDe ?? (() => base);

  if (parceiros.length === 0) {
    return (
      <EmptyState
        titulo="Nenhum parceiro cadastrado"
        texto="Imobiliárias e corretores que vendem estas unidades. Cada um recebe um acesso próprio, somente de leitura."
        acao={{ href: `${base}/novo`, label: "Cadastrar o primeiro" }}
      />
    );
  }

  const colunas = mostrarIncorporadora
    ? ["Parceiro", "Incorporadora", "CPF / CNPJ", "Contato", "Acesso", "Situação", ""]
    : ["Parceiro", "CPF / CNPJ", "Contato", "Acesso", "Situação", ""];

  return (
    <div className="overflow-x-auto rounded-lg border border-trilha-200 bg-white">
      <table
        className={`w-full border-collapse text-left ${mostrarIncorporadora ? "min-w-[980px]" : "min-w-[820px]"}`}
      >
        <thead>
          <tr className="border-b border-trilha-100">
            {colunas.map((h, i) => (
              <th
                key={`${h}-${i}`}
                className="font-display px-5 py-3 text-sm font-semibold tracking-wide text-trilha-400 uppercase"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {parceiros.map((p) => {
            const rota = rotaDa(p);
            return (
              <tr key={p.id} className="border-b border-trilha-100 last:border-0">
                <td className="px-5 py-4">
                  <Link
                    href={`${rota}/${p.id}/editar`}
                    className="font-display text-[17px] font-semibold text-trilha-700 underline underline-offset-2 hover:text-trilha-500"
                  >
                    {p.nome}
                  </Link>
                  {p.creci ? <span className="block text-sm text-trilha-400">{p.creci}</span> : null}
                </td>

                {mostrarIncorporadora ? (
                  <td className="px-5 py-4 text-[15px]">
                    {p.incorporadora ? (
                      <Link
                        href={`/incorporadoras/${p.incorporadora.id}`}
                        className="text-trilha-700 underline underline-offset-2 hover:text-trilha-500"
                      >
                        {p.incorporadora.nome}
                      </Link>
                    ) : (
                      <span className="text-trilha-300">—</span>
                    )}
                  </td>
                ) : null}

                <td className="px-5 py-4 text-[15px] tabular-nums text-trilha-400">
                  {documentoFormatado(p.documento)}
                </td>
                <td className="px-5 py-4 text-[15px]">
                  {p.email}
                  <span className="block text-sm tabular-nums text-trilha-400">
                    {maskPhone(p.telefone)}
                  </span>
                </td>
                <td className="px-5 py-4 text-[15px] text-trilha-400">
                  {/* Sem conta_id não há login. Com conta_id mas sem e-mail legível,
                      o acesso existe e quem está olhando é que não pode lê-lo. */}
                  {!p.conta_id ? "sem acesso criado" : (p.conta?.email ?? "acesso criado")}
                </td>
                <td className="px-5 py-4">
                  <span
                    className={`font-display inline-block rounded-full border px-2.5 py-0.5 text-sm font-semibold ${
                      p.ativo
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-slate-200 bg-slate-100 text-slate-600"
                    }`}
                  >
                    {p.ativo ? "Ativo" : "Inativo"}
                  </span>
                </td>
                <td className="px-5 py-4 text-right whitespace-nowrap">
                  <Link
                    href={`${rota}/${p.id}/acesso`}
                    className="font-display text-sm font-semibold tracking-wide text-trilha-500 uppercase underline underline-offset-2 hover:text-trilha-700"
                  >
                    Acesso
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
