import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ehParceiro, getSessao } from "@/lib/sessao";
import { maskCNPJ, maskCPF, maskPhone } from "@/lib/br";
import { PageHeader } from "@/components/ui";
import ErroLeitura from "@/components/erro-leitura";
import FormParceiro from "@/components/form-parceiro";
import { RemoverParceiro } from "@/components/remover-parceiro";

type Registro = {
  nome: string;
  incorporadora_id: string | null;
  conta_id: string | null;
  convite_token: string | null;
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

export default async function EditarMeuParceiroPage({
  params,
}: {
  params: Promise<{ parceiroId: string }>;
}) {
  // A Trilha também edita por aqui: desde que ela ganhou a lista geral de
  // parceiros, mandá-la para `/incorporadoras` era devolver ela ao começo.
  const sessao = await getSessao();
  if (ehParceiro(sessao)) redirect("/empreendimentos");

  const { parceiroId } = await params;
  const supabase = await createClient();

  // Sem filtro por incorporadora na consulta: quem recorta é a policy. Se o
  // parceiro não for dela, simplesmente não vem linha nenhuma.
  const { data, error } = await supabase
    .from("parceiro")
    .select(
      `nome, incorporadora_id, conta_id, convite_token, documento, creci, email, telefone, endereco, ativo,
       banco, agencia, conta_numero, chave_pix, chave_pix_tipo`,
    )
    .eq("id", parceiroId)
    .maybeSingle<Registro>();

  if (error) return <ErroLeitura oQue="deste parceiro" erro={error} />;
  if (!data) notFound();

  // Parceiro Trilha mora em outra seção do menu; a mesma tela serve às duas.
  const base = data.incorporadora_id ? "/parceiros" : "/parceiro-trilha";
  const secao = data.incorporadora_id ? "Parceiros" : "Parceiro Trilha";

  return (
    <>
      <PageHeader
        titulo={data.nome}
        voltar={{ href: base, label: secao }}
        /* O rótulo diz a situação, e não uma ação genérica: "Criar acesso"
           num parceiro que já tem convite em aberto manda a pessoa para a
           tela certa pelo motivo errado. */
        acaoSecundaria={{
          href: `${base}/${parceiroId}/acesso`,
          label: data.conta_id
            ? "Alterar acesso"
            : data.convite_token
              ? "Convite pendente"
              : "Criar acesso",
        }}
      />
      <FormParceiro
        modo="editar"
        id={parceiroId}
        voltarPara={base}
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
        <RemoverParceiro id={parceiroId} nome={data.nome} voltarPara={base} />
      </div>
    </>
  );
}
