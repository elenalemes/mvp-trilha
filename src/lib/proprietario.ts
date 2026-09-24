import type { createClient } from "@/lib/supabase/server";
import type { ProprietarioFormValues } from "@/lib/schemas";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type RegistroProprietario = {
  resp_nome: string;
  resp_cpf: string;
  resp_rg: string | null;
  resp_email: string;
  resp_telefone: string;
  resp_endereco: string | null;
  resp_profissao: string | null;
  resp_estado_civil: string | null;
  banco: string | null;
  agencia: string | null;
  conta_numero: string | null;
  chave_pix: string | null;
  chave_pix_tipo: string | null;
};

/** O cadastro de um proprietário PF (nulo se não existe ou não é PF). */
export async function lerProprietario(supabase: Supabase, id: string) {
  const { data } = await supabase
    .from("incorporadora")
    .select(
      `resp_nome, resp_cpf, resp_rg, resp_email, resp_telefone, resp_endereco, resp_profissao,
       resp_estado_civil, banco, agencia, conta_numero, chave_pix, chave_pix_tipo`,
    )
    .eq("id", id)
    .eq("tipo", "proprietario_pf")
    .maybeSingle<RegistroProprietario>();
  return data;
}

/** Do banco para o formulário (sem a parte de acesso). */
export function paraFormulario(
  d: RegistroProprietario,
  maskCPF: (v: string) => string,
  maskPhone: (v: string) => string,
): Omit<ProprietarioFormValues, "acesso"> {
  return {
    pessoa: {
      nome: d.resp_nome,
      cpf: maskCPF(d.resp_cpf),
      email: d.resp_email,
      telefone: maskPhone(d.resp_telefone),
      rg: d.resp_rg ?? "",
      endereco: d.resp_endereco ?? "",
      profissao: d.resp_profissao ?? "",
      estado_civil: d.resp_estado_civil ?? "",
    },
    banco: {
      banco: d.banco ?? "",
      agencia: d.agencia ?? "",
      conta_numero: d.conta_numero ?? "",
      chave_pix: d.chave_pix ?? "",
      chave_pix_tipo: (d.chave_pix_tipo ?? "") as ProprietarioFormValues["banco"]["chave_pix_tipo"],
    },
  };
}
