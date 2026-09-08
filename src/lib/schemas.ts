import { z } from "zod";
import { isValidCNPJ, isValidCPF, isValidEmail, isValidPhone, parseDecimal } from "@/lib/br";
import { MAX_OPCOES_PAGAMENTO, PRAZO_TRILHA_MAX, PRAZO_TRILHA_MIN } from "@/lib/trilha";

const req = (label: string) => z.string().trim().min(1, `${label} é obrigatório`);
const opt = () => z.string().trim().optional();
const optNum = (label: string) =>
  z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || /^\d+$/.test(v), `${label} deve ser um número inteiro`);

// ---------------------------------------------------------------- login

export const loginSchema = z.object({
  email: req("E-mail").refine(isValidEmail, "E-mail inválido"),
  password: z.string().min(6, "Senha deve ter ao menos 6 caracteres"),
});

// ------------------------------------------------------ dados bancários

/**
 * Para onde vai o dinheiro. Incorporadora e parceiro usam os mesmos campos —
 * o repasse é o mesmo tipo de operação, então a validação também é a mesma.
 */
const bancoSchema = z.object({
  banco: opt(),
  agencia: opt(),
  conta_numero: opt(),
  chave_pix: opt(),
  chave_pix_tipo: z
    .enum(["cpf", "cnpj", "email", "telefone", "aleatoria"])
    .optional()
    .or(z.literal("")),
});

// -------------------------------------------------------- incorporadora

const dadosIncorporadora = {
  empresa: z.object({
    nome: req("Nome da incorporadora").min(3, "Nome muito curto"),
    cnpj: req("CNPJ").refine(isValidCNPJ, "CNPJ inválido"),
    email: req("E-mail corporativo").refine(isValidEmail, "E-mail inválido"),
    telefone: req("Telefone").refine(isValidPhone, "Telefone inválido"),
    endereco: opt(),
  }),
  banco: bancoSchema,
  responsavel: z.object({
    nome: req("Nome do responsável").min(3, "Nome muito curto"),
    cpf: req("CPF").refine(isValidCPF, "CPF inválido"),
    rg: opt(),
    profissao: opt(),
    cargo: opt(),
    estado_civil: opt(),
    email: req("E-mail do responsável").refine(isValidEmail, "E-mail inválido"),
    telefone: req("Telefone do responsável").refine(isValidPhone, "Telefone inválido"),
    endereco: opt(),
  }),
};

/** Cadastro: a senha de acesso é obrigatória, porque o acesso nasce junto. */
export const incorporadoraSchema = z.object({
  ...dadosIncorporadora,
  acesso: z.object({
    email: req("E-mail de acesso").refine(isValidEmail, "E-mail inválido"),
    senha: z.string().min(8, "A senha precisa ter ao menos 8 caracteres"),
  }),
});

/** Edição: os dados cadastrais mudam; o acesso tem tela própria. */
export const incorporadoraEdicaoSchema = z.object(dadosIncorporadora);

export type IncorporadoraFormValues = z.infer<typeof incorporadoraSchema>;
export type IncorporadoraEdicaoValues = z.infer<typeof incorporadoraEdicaoSchema>;

/** Troca de e-mail e/ou senha de acesso. Senha vazia significa "manter a atual". */
export const acessoSchema = z.object({
  email: req("E-mail de acesso").refine(isValidEmail, "E-mail inválido"),
  senha: z
    .string()
    .optional()
    .refine((v) => !v || v.length >= 8, "A senha precisa ter ao menos 8 caracteres"),
});

export type AcessoFormValues = z.infer<typeof acessoSchema>;

// ------------------------------------------------------- empreendimento

export const empreendimentoSchema = z.object({
  incorporadora_id: req("Incorporadora").uuid("Selecione uma incorporadora"),
  nome: req("Nome do empreendimento").min(2, "Nome muito curto"),
  endereco: opt(),
});

export type EmpreendimentoFormValues = z.infer<typeof empreendimentoSchema>;

// --------------------------------------------------------------- imóvel

export const imovelSchema = z.object({
  empreendimento_id: req("Empreendimento").uuid("Selecione um empreendimento"),
  identificacao: req("Identificação"),
  /**
   * Os quatro campos abaixo nasceram na importação por IA e ficaram meses sem
   * formulário: a IA gravava, e nenhuma tela editava. Uma unidade cadastrada à
   * mão nascia sem eles.
   */
  tipologia: opt(),
  area_total: opt(),
  area_garden: opt(),
  observacao: opt(),
  numero_matricula: opt(),
  tipo: z.enum(["apartamento", "casa", "sala_comercial", "terreno", "outro"]),
  status: z.enum(["disponivel", "reservado", "em_negociacao", "em_trilha", "indisponivel"]),
  valor: opt(),
  metros_quadrados: opt(),
  posicao_solar: opt(),
  num_quartos: optNum("Quartos"),
  num_suites: optNum("Suítes"),
  num_banheiros: optNum("Banheiros"),
  num_vagas: optNum("Vagas"),
  matricula_vaga: opt(),
  sacada: z.boolean(),
  churrasqueira: z.boolean(),
});

export type ImovelFormValues = z.infer<typeof imovelSchema>;

// --------------------------------------------- opções de pagamento

/** Aceita "20" e "2,5". Vazio conta como ausente. */
const numeroEntre = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .refine((v) => {
      const n = parseDecimal(v);
      return n !== null && n >= min && n <= max;
    }, `${label} deve ser um número entre ${min} e ${max}`);

/**
 * Só três campos são livres. O que se paga durante a Trilha (entrada − ato) e
 * o saldo a financiar (100% − entrada) são consequência, e por isso não são
 * digitados nem guardados.
 */
export const opcaoPagamentoSchema = z
  .object({
    percentual_entrada: numeroEntre("Entrada", 0.01, 100),
    percentual_ato: z
      .string()
      .trim()
      .refine((v) => {
        if (v === "") return true;
        const n = parseDecimal(v);
        return n !== null && n >= 0 && n <= 100;
      }, "Ato deve ser um número entre 0 e 100"),
    prazo_meses: numeroEntre("Tempo de Trilha", PRAZO_TRILHA_MIN, PRAZO_TRILHA_MAX).refine(
      (v) => Number.isInteger(parseDecimal(v)),
      "Tempo de Trilha deve ser um número inteiro de meses",
    ),
  })
  .refine(
    (o) => (parseDecimal(o.percentual_ato || "0") ?? 0) <= (parseDecimal(o.percentual_entrada) ?? 0),
    { message: "O ato sai de dentro da entrada — não pode ser maior que ela", path: ["percentual_ato"] },
  );

export const opcoesPagamentoSchema = z.object({
  opcoes: z
    .array(opcaoPagamentoSchema)
    .max(MAX_OPCOES_PAGAMENTO, `No máximo ${MAX_OPCOES_PAGAMENTO} opções por incorporadora`),
  /**
   * Só viaja quando se edita o padrão da incorporadora: a comissão é dela, não
   * de cada opção nem de cada empreendimento.
   */
  percentual_comissao: numeroEntre("Comissão", 0, 100).optional(),
});

export type OpcaoPagamentoValues = z.infer<typeof opcaoPagamentoSchema>;
export type OpcoesPagamentoValues = z.infer<typeof opcoesPagamentoSchema>;


// ------------------------------------------------------------- parceiro

/**
 * Imobiliária ou corretor. O documento é um só campo porque o parceiro tanto
 * pode ser pessoa física quanto jurídica — validamos como CPF ou CNPJ e
 * deixamos opcional: cadastrar o parceiro não pode travar por falta de um
 * número que às vezes só chega no dia do repasse.
 */
const dadosParceiro = {
  dados: z.object({
    nome: req("Nome do parceiro").min(3, "Nome muito curto"),
    documento: opt().refine(
      (v) => !v || isValidCPF(v) || isValidCNPJ(v),
      "Informe um CPF ou CNPJ válido",
    ),
    creci: opt(),
    email: req("E-mail").refine(isValidEmail, "E-mail inválido"),
    telefone: req("Telefone").refine(isValidPhone, "Telefone inválido"),
    endereco: opt(),
    ativo: z.boolean().optional(),
  }),
  banco: bancoSchema,
};

/** Cadastro: o acesso nasce junto, igual ao da incorporadora. */
export const parceiroSchema = z.object({
  ...dadosParceiro,
  acesso: z.object({
    email: req("E-mail de acesso").refine(isValidEmail, "E-mail inválido"),
    senha: z.string().min(8, "A senha precisa ter ao menos 8 caracteres"),
  }),
});

/** Edição: o acesso tem tela própria. */
export const parceiroEdicaoSchema = z.object(dadosParceiro);

export type ParceiroFormValues = z.infer<typeof parceiroSchema>;
export type ParceiroEdicaoValues = z.infer<typeof parceiroEdicaoSchema>;
