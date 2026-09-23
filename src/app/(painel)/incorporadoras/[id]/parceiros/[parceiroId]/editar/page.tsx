import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessao } from "@/lib/sessao";
import { maskCNPJ, maskCPF, maskPhone } from "@/lib/br";
import { PageHeader } from "@/components/ui";
import FormParceiro from "@/components/form-parceiro";
import { RemoverParceiro } from "@/components/remover-parceiro";

type Registro = {
  nome: string;
  documento: string | null;
  creci: string | null;
  email: string;
  telefone: string;
  endereco: string | null;
  ativo: boolean;
  banco: string | null;
  agencia: string | null;
  conta_numero: string | null;
  chave_pix: string | null;
  chave_pix_tipo: string | null;
};

const documentoMascarado = (v: string | null) =>
  !v ? "" : v.length > 11 ? maskCNPJ(v) : maskCPF(v);

export default async function EditarParceiroPage({
  params,
}: {
  params: Promise<{ id: string; parceiroId: string }>;
}) {
  const sessao = await getSessao();
  if (sessao?.conta && sessao.conta.tipo !== "trilha_admin") redirect("/empreendimentos");

  const { id, parceiroId } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("parceiro")
    .select(
      `nome, documento, creci, email, telefone, endereco, ativo,
       banco, agencia, conta_numero, chave_pix, chave_pix_tipo`,
    )
    .eq("id", parceiroId)
    .eq("incorporadora_id", id)
    .maybeSingle<Registro>();

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-4">
        <p className="text-[15px] font-semibold text-red-800">
          O banco recusou a leitura deste parceiro.
        </p>
        <p className="mt-1 text-sm text-red-700">
          {error.code ?? "sem código"}: {error.message ?? "sem mensagem"}
        </p>
      </div>
    );
  }
  if (!data) notFound();

  return (
    <>
      <PageHeader
        titulo={data.nome}
        descricao="Dados cadastrais do parceiro"
        voltar={{ href: `/incorporadoras/${id}/parceiros`, label: "Parceiros" }}
        acaoSecundaria={{
          href: `/incorporadoras/${id}/parceiros/${parceiroId}/acesso`,
          label: "Alterar acesso",
        }}
      />
      <FormParceiro
        modo="editar"
        id={parceiroId}
        voltarPara={`/incorporadoras/${id}/parceiros`}
        inicial={{
          dados: {
            nome: data.nome,
            documento: documentoMascarado(data.documento),
            creci: data.creci ?? "",
            email: data.email,
            telefone: maskPhone(data.telefone),
            endereco: data.endereco ?? "",
            ativo: data.ativo,
          },
          banco: {
            banco: data.banco ?? "",
            agencia: data.agencia ?? "",
            conta_numero: data.conta_numero ?? "",
            chave_pix: data.chave_pix ?? "",
            chave_pix_tipo: (data.chave_pix_tipo ?? "") as "",
          },
          acesso: { email: "", senha: "" },
        }}
      />

      <div className="mt-8">
        <RemoverParceiro
          id={parceiroId}
          nome={data.nome}
          voltarPara={`/incorporadoras/${id}/parceiros`}
        />
      </div>
    </>
  );
}
