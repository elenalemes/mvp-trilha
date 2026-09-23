import type { SupabaseClient } from "@supabase/supabase-js";
import { maskCPF, maskPhone } from "@/lib/br";
import type { FichaValues } from "@/lib/schemas";

/**
 * A leitura dos dados do comprador de um negócio, no formato do formulário.
 *
 * Existe a ficha salva → devolve ela. Não existe → devolve o que a proposta já
 * sabe (nome, CPF, e-mail, telefone) e o resto em branco, com o estado civil
 * vazio de propósito: obriga a escolher, em vez de herdar um "solteiro" que
 * ninguém confirmou.
 *
 * Recebe o cliente da SESSÃO: quem não pode ler a ficha (a incorporadora)
 * recebe `null`, e a tela diz que os dados são restritos.
 */

type LinhaFicha = {
  nome: string;
  email: string;
  telefone: string;
  cpf: string;
  rg: string;
  rg_emissor: string;
  endereco: string;
  profissao: string;
  estado_civil: FichaValues["comprador"]["estado_civil"];
  regime_bens: string | null;
  conjuge_nome: string | null;
  conjuge_email: string | null;
  conjuge_telefone: string | null;
  conjuge_cpf: string | null;
  conjuge_rg: string | null;
  conjuge_rg_emissor: string | null;
  conjuge_endereco: string | null;
  conjuge_profissao: string | null;
};

export type CompradorDaProposta = { nome: string; cpf: string; email: string; telefone: string } | null;

export type DadosComprador = {
  valores: FichaValues;
  /** Já foi salva alguma vez — a tarefa está (ou esteve) concluída. */
  salva: boolean;
  /** Linha curta para a tarefa fechada: "Fulano · 000.000.000-00 · Casado(a)". */
  estadoCivil: string | null;
};

const CAMPOS = `nome, email, telefone, cpf, rg, rg_emissor, endereco, profissao, estado_civil, regime_bens,
  conjuge_nome, conjuge_email, conjuge_telefone, conjuge_cpf, conjuge_rg, conjuge_rg_emissor,
  conjuge_endereco, conjuge_profissao`;

export async function lerDadosComprador(
  supabase: SupabaseClient,
  negocioId: string,
  comprador: CompradorDaProposta,
): Promise<{ ok: true; dados: DadosComprador } | { ok: false; erro: { code?: string; message: string } }> {
  const { data: f, error } = await supabase
    .from("ficha_qualificacao")
    .select(CAMPOS)
    .eq("negocio_id", negocioId)
    .maybeSingle<LinhaFicha>();

  if (error) return { ok: false, erro: error };

  if (f) {
    return {
      ok: true,
      dados: {
        salva: true,
        estadoCivil: f.estado_civil,
        valores: {
          comprador: {
            nome: f.nome,
            email: f.email,
            telefone: maskPhone(f.telefone),
            cpf: maskCPF(f.cpf),
            rg: f.rg,
            rg_emissor: f.rg_emissor,
            endereco: f.endereco,
            profissao: f.profissao,
            estado_civil: f.estado_civil,
            regime_bens: f.regime_bens ?? "",
          },
          conjuge: {
            nome: f.conjuge_nome ?? "",
            email: f.conjuge_email ?? "",
            telefone: f.conjuge_telefone ? maskPhone(f.conjuge_telefone) : "",
            cpf: f.conjuge_cpf ? maskCPF(f.conjuge_cpf) : "",
            rg: f.conjuge_rg ?? "",
            rg_emissor: f.conjuge_rg_emissor ?? "",
            endereco: f.conjuge_endereco ?? "",
            profissao: f.conjuge_profissao ?? "",
          },
        },
      },
    };
  }

  const c = comprador;
  return {
    ok: true,
    dados: {
      salva: false,
      estadoCivil: null,
      valores: {
        comprador: {
          nome: c?.nome ?? "",
          email: c?.email ?? "",
          telefone: c?.telefone ? maskPhone(c.telefone) : "",
          cpf: c?.cpf ? maskCPF(c.cpf) : "",
          rg: "",
          rg_emissor: "",
          endereco: "",
          profissao: "",
          estado_civil: "" as FichaValues["comprador"]["estado_civil"],
          regime_bens: "",
        },
        conjuge: { nome: "", email: "", telefone: "", cpf: "", rg: "", rg_emissor: "", endereco: "", profissao: "" },
      },
    },
  };
}
