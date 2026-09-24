import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ehParceiro, ehProprietarioPF, getSessao } from "@/lib/sessao";
import FormProprietario, { PROPRIETARIO_VAZIO } from "@/components/form-proprietario";
import { lerProprietario, paraFormulario } from "@/lib/proprietario";
import { maskCNPJ, maskCPF, maskPhone } from "@/lib/br";
import { PageHeader } from "@/components/ui";
import FormIncorporadora from "@/components/form-incorporadora";
import type { IncorporadoraFormValues } from "@/lib/schemas";

type Registro = {
  nome: string;
  cnpj: string;
  email: string;
  telefone: string;
  endereco: string | null;
  resp_nome: string;
  resp_cpf: string;
  resp_rg: string | null;
  resp_profissao: string | null;
  resp_cargo: string | null;
  resp_estado_civil: string | null;
  resp_email: string;
  resp_telefone: string;
  resp_endereco: string | null;
  banco: string | null;
  agencia: string | null;
  conta_numero: string | null;
  chave_pix: string | null;
  chave_pix_tipo: string | null;
};

export default async function PerfilPage() {
  const sessao = await getSessao();

  // O admin da Trilha não tem perfil de incorporadora — edita cada uma na ficha dela.
  if (sessao?.conta?.tipo === "trilha_admin") redirect("/incorporadoras");
  // O parceiro não tem opções nem ficha própria: o cadastro dele é de quem o cadastrou.
  if (ehParceiro(sessao)) redirect("/empreendimentos");
  if (!sessao?.incorporadoraId) {
    return (
      <p className="rounded-md border border-aviso/20 bg-aviso-suave px-5 py-4 text-sm text-aviso">
        Esta conta não está ligada a nenhuma incorporadora.
      </p>
    );
  }

  const supabase = await createClient();

  // Proprietário PF: dados pessoais, sem CNPJ nem "responsável".
  if (ehProprietarioPF(sessao)) {
    const pf = await lerProprietario(supabase, sessao.incorporadoraId);
    if (!pf) redirect("/");
    return (
      <>
        <PageHeader titulo="Meus dados" />
        <FormProprietario modo="perfil" inicial={{ ...PROPRIETARIO_VAZIO, ...paraFormulario(pf, maskCPF, maskPhone) }} />
      </>
    );
  }

  const { data } = await supabase
    .from("incorporadora")
    .select(
      `nome, cnpj, email, telefone, endereco,
       resp_nome, resp_cpf, resp_rg, resp_profissao, resp_cargo, resp_estado_civil,
       resp_email, resp_telefone, resp_endereco,
       banco, agencia, conta_numero, chave_pix, chave_pix_tipo`,
    )
    .eq("id", sessao.incorporadoraId)
    .maybeSingle<Registro>();

  if (!data) {
    return (
      <p className="rounded-md border border-aviso/20 bg-aviso-suave px-5 py-4 text-sm text-aviso">
        Não foi possível carregar seus dados.
      </p>
    );
  }

  const inicial: IncorporadoraFormValues = {
    empresa: {
      nome: data.nome,
      cnpj: maskCNPJ(data.cnpj),
      email: data.email,
      telefone: maskPhone(data.telefone),
      endereco: data.endereco ?? "",
    },
    banco: {
      banco: data.banco ?? "",
      agencia: data.agencia ?? "",
      conta_numero: data.conta_numero ?? "",
      chave_pix: data.chave_pix ?? "",
      chave_pix_tipo:
        (data.chave_pix_tipo ?? "") as IncorporadoraFormValues["banco"]["chave_pix_tipo"],
    },
    responsavel: {
      nome: data.resp_nome,
      cpf: maskCPF(data.resp_cpf),
      rg: data.resp_rg ?? "",
      profissao: data.resp_profissao ?? "",
      cargo: data.resp_cargo ?? "",
      estado_civil: data.resp_estado_civil ?? "",
      email: data.resp_email,
      telefone: maskPhone(data.resp_telefone),
      endereco: data.resp_endereco ?? "",
    },
    acesso: { email: "", senha: "" },
  };

  return (
    <>
      <PageHeader
        titulo="Meus dados"
      />
      <FormIncorporadora modo="perfil" inicial={inicial} />
    </>
  );
}
