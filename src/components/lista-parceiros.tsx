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
};

/** CPF e CNPJ moram na mesma coluna: a máscara sai do tamanho. */
const documentoFormatado = (v: string | null) =>
  !v ? "—" : v.length > 11 ? maskCNPJ(v) : maskCPF(v);

/**
 * A mesma tabela serve à Trilha e à incorporadora — muda só de onde as rotas
 * penduram. `base` é o prefixo: `/incorporadoras/<id>/parceiros` para o admin,
 * `/parceiros` para a incorporadora olhando os dela.
 */
export default function ListaParceiros({
  parceiros,
  base,
}: {
  parceiros: ParceiroLinha[];
  base: string;
}) {
  if (parceiros.length === 0) {
    return (
      <EmptyState
        titulo="Nenhum parceiro cadastrado"
        texto="Imobiliárias e corretores que vendem estas unidades. Cada um recebe um acesso próprio, somente de leitura."
        acao={{ href: `${base}/novo`, label: "Cadastrar o primeiro" }}
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-trilha-200 bg-white">
      <table className="w-full min-w-[820px] border-collapse text-left">
        <thead>
          <tr className="border-b border-trilha-100">
            {["Parceiro", "CPF / CNPJ", "Contato", "Acesso", "Situação", ""].map((h, i) => (
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
          {parceiros.map((p) => (
            <tr key={p.id} className="border-b border-trilha-100 last:border-0">
              <td className="px-5 py-4">
                <Link
                  href={`${base}/${p.id}/editar`}
                  className="font-display text-[17px] font-semibold text-trilha-700 underline underline-offset-2 hover:text-trilha-500"
                >
                  {p.nome}
                </Link>
                {p.creci ? <span className="block text-sm text-trilha-400">{p.creci}</span> : null}
              </td>
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
                  href={`${base}/${p.id}/acesso`}
                  className="font-display text-sm font-semibold tracking-wide text-trilha-500 uppercase underline underline-offset-2 hover:text-trilha-700"
                >
                  Acesso
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
