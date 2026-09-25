import type { SupabaseClient } from "@supabase/supabase-js";
import { maskCPF, maskPhone } from "@/lib/br";
import type { FichaVendedorValues } from "@/lib/schemas";

/**
 * O lado do vendedor pessoa física no fechamento (proprietário PF).
 *
 * As tarefas dele vivem na etapa "Documentação do vendedor", com
 * `ator = 'incorporadora'` — é isso que as deixa com o proprietário (a linha
 * dele é uma `incorporadora` de tipo PF). O nome da etapa é a marca que o
 * banco também usa (`pode_ler_arquivo_tarefa`, os gatilhos da ficha).
 */

export const ETAPA_VENDEDOR = "Documentação do vendedor";

export const ehTarefaDoVendedor = (t: { etapa: string }) => t.etapa === ETAPA_VENDEDOR;

/** O documento de estado civil muda conforme o estado civil informado. */
export function instrucaoEstadoCivil(estadoCivil: string | null | undefined): string {
  switch (estadoCivil) {
    case "solteiro":
      return "Certidão de nascimento atualizada.";
    case "casado":
      return "Certidão de casamento atualizada.";
    case "uniao_estavel":
      return "Escritura ou declaração de união estável.";
    case "divorciado":
      return "Certidão de casamento com a averbação do divórcio.";
    case "viuvo":
      return "Certidão de casamento atualizada e certidão de óbito do cônjuge. Anexe as duas aqui.";
    default:
      return "Preencha primeiro os dados do vendedor: o documento pedido aqui depende do estado civil.";
  }
}

export type DadosVendedor = {
  valores: FichaVendedorValues;
  salva: boolean;
  estadoCivil: string | null;
};

type LinhaFicha = {
  nome: string;
  email: string;
  telefone: string;
  cpf: string;
  rg: string | null;
  endereco: string | null;
  profissao: string | null;
  estado_civil: FichaVendedorValues["vendedor"]["estado_civil"];
  conjuge_nome: string | null;
  conjuge_email: string | null;
  conjuge_telefone: string | null;
  conjuge_cpf: string | null;
  conjuge_rg: string | null;
  conjuge_endereco: string | null;
  conjuge_profissao: string | null;
  banco: string | null;
  agencia: string | null;
  conta_numero: string | null;
  chave_pix: string | null;
};

type LinhaCadastro = {
  resp_nome: string;
  resp_email: string;
  resp_telefone: string;
  resp_cpf: string;
  resp_rg: string | null;
  resp_endereco: string | null;
  resp_profissao: string | null;
  resp_estado_civil: string | null;
  banco: string | null;
  agencia: string | null;
  conta_numero: string | null;
  chave_pix: string | null;
};

const ESTADOS = ["solteiro", "casado", "uniao_estavel", "divorciado", "viuvo"];
const CONJUGE_VAZIO = { nome: "", email: "", telefone: "", cpf: "", rg: "", endereco: "", profissao: "" };

/**
 * Ficha salva → ela. Sem ficha → o cadastro do proprietário, para só conferir.
 * Cliente da SESSÃO: o corretor não lê nem a ficha nem (necessariamente) o
 * cadastro, e recebe `null`.
 */
export async function lerDadosVendedor(
  supabase: SupabaseClient,
  negocioId: string,
  proprietarioId: string,
): Promise<DadosVendedor | null> {
  const { data: f } = await supabase
    .from("ficha_vendedor")
    .select(
      `nome, email, telefone, cpf, rg, endereco, profissao, estado_civil,
       conjuge_nome, conjuge_email, conjuge_telefone, conjuge_cpf, conjuge_rg, conjuge_endereco, conjuge_profissao,
       banco, agencia, conta_numero, chave_pix`,
    )
    .eq("negocio_id", negocioId)
    .maybeSingle<LinhaFicha>();

  if (f) {
    return {
      salva: true,
      estadoCivil: f.estado_civil,
      valores: {
        vendedor: {
          nome: f.nome,
          email: f.email,
          telefone: maskPhone(f.telefone),
          cpf: maskCPF(f.cpf),
          rg: f.rg ?? "",
          endereco: f.endereco ?? "",
          profissao: f.profissao ?? "",
          estado_civil: f.estado_civil,
        },
        conjuge: {
          nome: f.conjuge_nome ?? "",
          email: f.conjuge_email ?? "",
          telefone: f.conjuge_telefone ? maskPhone(f.conjuge_telefone) : "",
          cpf: f.conjuge_cpf ? maskCPF(f.conjuge_cpf) : "",
          rg: f.conjuge_rg ?? "",
          endereco: f.conjuge_endereco ?? "",
          profissao: f.conjuge_profissao ?? "",
        },
        banco: {
          banco: f.banco ?? "",
          agencia: f.agencia ?? "",
          conta_numero: f.conta_numero ?? "",
          chave_pix: f.chave_pix ?? "",
        },
      },
    };
  }

  const { data: c } = await supabase
    .from("incorporadora")
    .select(
      `resp_nome, resp_email, resp_telefone, resp_cpf, resp_rg, resp_endereco, resp_profissao,
       resp_estado_civil, banco, agencia, conta_numero, chave_pix`,
    )
    .eq("id", proprietarioId)
    .maybeSingle<LinhaCadastro>();

  if (!c) return null;

  const estado = c.resp_estado_civil && ESTADOS.includes(c.resp_estado_civil) ? c.resp_estado_civil : "";
  return {
    salva: false,
    estadoCivil: null,
    valores: {
      vendedor: {
        nome: c.resp_nome,
        email: c.resp_email,
        telefone: maskPhone(c.resp_telefone),
        cpf: maskCPF(c.resp_cpf),
        rg: c.resp_rg ?? "",
        endereco: c.resp_endereco ?? "",
        profissao: c.resp_profissao ?? "",
        estado_civil: estado as FichaVendedorValues["vendedor"]["estado_civil"],
      },
      conjuge: CONJUGE_VAZIO,
      banco: {
        banco: c.banco ?? "",
        agencia: c.agencia ?? "",
        conta_numero: c.conta_numero ?? "",
        chave_pix: c.chave_pix ?? "",
      },
    },
  };
}
