/**
 * A conversa com o Asaas.
 *
 * SÓ SERVIDOR. A chave do Asaas move dinheiro: nada aqui pode ser importado por
 * componente de cliente, e a chave nunca aparece em log nem em mensagem de
 * erro devolvida à tela.
 *
 * O AMBIENTE vem do banco (`config_financeiro.asaas_ambiente`) e a CHAVE vem da
 * Vercel (`ASAAS_API_KEY`). As duas precisam concordar: chave de teste
 * (`$aact_hmlg_`) só fala com o sandbox, chave real (`$aact_prod_`) só com a
 * produção. Se não baterem, nada é enviado — é a trava contra cobrar cliente
 * de verdade achando que era teste, e contra o contrário.
 *
 * NUNCA DUAS VEZES. Toda cobrança leva `externalReference` = id da parcela.
 * Antes de criar, procura por ela: se uma tentativa anterior criou no Asaas e
 * caiu antes de gravar no banco, a cobrança é reencontrada em vez de duplicada.
 * O mesmo vale para o cliente, pelo CPF.
 */

export type AmbienteAsaas = "sandbox" | "producao";

const URL_BASE: Record<AmbienteAsaas, string> = {
  sandbox: "https://api-sandbox.asaas.com/v3",
  producao: "https://api.asaas.com/v3",
};

const PREFIXO_CHAVE: Record<AmbienteAsaas, string> = {
  sandbox: "$aact_hmlg_",
  producao: "$aact_prod_",
};

export class ErroAsaas extends Error {
  constructor(
    message: string,
    /** Código HTTP, quando a resposta veio do Asaas. */
    public status?: number,
  ) {
    super(message);
    this.name = "ErroAsaas";
  }
}

type Config = { ambiente: AmbienteAsaas; chave: string };

function configurar(ambiente: AmbienteAsaas): Config {
  const chave = process.env.ASAAS_API_KEY?.trim();

  if (!chave) {
    throw new ErroAsaas("A chave do Asaas não está configurada na Vercel (ASAAS_API_KEY).");
  }

  // Chaves antigas não têm o prefixo de ambiente; essas passam e o próprio
  // Asaas recusa se estiverem no lugar errado. As novas, conferimos aqui.
  const outro: AmbienteAsaas = ambiente === "sandbox" ? "producao" : "sandbox";
  if (chave.startsWith(PREFIXO_CHAVE[outro])) {
    throw new ErroAsaas(
      ambiente === "sandbox"
        ? "A chave configurada é da conta REAL do Asaas, mas o sistema está em modo de teste. Nada foi enviado."
        : "A chave configurada é do SANDBOX, mas o sistema está em produção. Nada foi enviado.",
    );
  }

  return { ambiente, chave };
}

async function chamar<T>(
  cfg: Config,
  metodo: "GET" | "POST" | "PUT" | "DELETE",
  caminho: string,
  corpo?: unknown,
): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(`${URL_BASE[cfg.ambiente]}${caminho}`, {
      method: metodo,
      headers: {
        "Content-Type": "application/json",
        // Obrigatório para contas criadas depois de 13/06/2024.
        "User-Agent": "Trilha-Painel/1.0",
        access_token: cfg.chave,
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      cache: "no-store",
    });
  } catch (e) {
    throw new ErroAsaas(`Não consegui falar com o Asaas (${(e as Error).message}).`);
  }

  const texto = await resposta.text();
  let json: unknown = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    // resposta não-JSON: cai no tratamento de erro abaixo
  }

  if (!resposta.ok) {
    // O Asaas devolve { errors: [{ code, description }] } — a descrição já vem
    // em português e é a melhor coisa para mostrar ao admin.
    const erros = (json as { errors?: { description?: string }[] } | null)?.errors;
    const descricao = erros?.map((e) => e.description).filter(Boolean).join(" · ");
    throw new ErroAsaas(
      descricao || `O Asaas recusou a operação (HTTP ${resposta.status}).`,
      resposta.status,
    );
  }

  return json as T;
}

// ------------------------------------------------------------------ clientes

export type DadosCliente = {
  /** Id do comprador no nosso banco — vai como referência externa. */
  compradorId: string;
  nome: string;
  cpf: string;
  email: string;
  telefone: string;
};

type ClienteAsaas = { id: string; deleted?: boolean };
type Lista<T> = { data: T[]; totalCount: number };

const digitos = (v: string) => v.replace(/\D/g, "");

/**
 * Devolve o id do cliente no Asaas, criando se for preciso.
 * Procura pelo CPF antes de criar: o mesmo comprador nunca vira dois clientes.
 */
export async function garantirCliente(ambiente: AmbienteAsaas, d: DadosCliente): Promise<string> {
  const cfg = configurar(ambiente);
  const cpf = digitos(d.cpf);

  const achados = await chamar<Lista<ClienteAsaas>>(cfg, "GET", `/customers?cpfCnpj=${cpf}&limit=10`);
  const existente = achados.data.find((c) => !c.deleted);
  if (existente) return existente.id;

  const criado = await chamar<ClienteAsaas>(cfg, "POST", "/customers", {
    name: d.nome,
    cpfCnpj: cpf,
    email: d.email,
    mobilePhone: digitos(d.telefone),
    externalReference: d.compradorId,
    // Quem avisa o comprador da cobrança é o próprio Asaas (e-mail e SMS).
    notificationDisabled: false,
  });

  return criado.id;
}

// ----------------------------------------------------------------- cobranças

export type DadosCobranca = {
  clienteId: string;
  /** Id da parcela no nosso banco. É a trava contra cobrança duplicada. */
  parcelaId: string;
  valor: number;
  /** AAAA-MM-DD */
  vencimento: string;
  descricao: string;
  multaPercentual: number;
  jurosMensal: number;
};

export type CobrancaAsaas = {
  id: string;
  status: string;
  invoiceUrl: string;
  value: number;
  dueDate: string;
  deleted?: boolean;
};

/** Cria a cobrança Pix — ou devolve a que já existe para esta parcela. */
export async function garantirCobranca(
  ambiente: AmbienteAsaas,
  d: DadosCobranca,
): Promise<{ cobranca: CobrancaAsaas; jaExistia: boolean }> {
  const cfg = configurar(ambiente);

  const achadas = await chamar<Lista<CobrancaAsaas>>(
    cfg,
    "GET",
    `/payments?externalReference=${encodeURIComponent(d.parcelaId)}&limit=10`,
  );
  const existente = achadas.data.find((c) => !c.deleted);
  if (existente) return { cobranca: existente, jaExistia: true };

  const cobranca = await chamar<CobrancaAsaas>(cfg, "POST", "/payments", {
    customer: d.clienteId,
    billingType: "PIX",
    value: d.valor,
    dueDate: d.vencimento,
    description: d.descricao.slice(0, 500),
    externalReference: d.parcelaId,
    // Multa: percentual sobre a parcela, uma vez. Juros: % ao mês, pro rata.
    fine: { value: d.multaPercentual, type: "PERCENTAGE" },
    interest: { value: d.jurosMensal },
  });

  return { cobranca, jaExistia: false };
}

/** Situação atual de uma cobrança — usada para conferir sem esperar o aviso. */
export async function lerCobranca(ambiente: AmbienteAsaas, id: string): Promise<CobrancaAsaas> {
  return chamar<CobrancaAsaas>(configurar(ambiente), "GET", `/payments/${encodeURIComponent(id)}`);
}

// ------------------------------------------------------------- transferências

export type TipoChaveAsaas = "CPF" | "CNPJ" | "EMAIL" | "PHONE" | "EVP";

const TIPO_DO_CADASTRO: Record<string, TipoChaveAsaas> = {
  cpf: "CPF",
  cnpj: "CNPJ",
  email: "EMAIL",
  telefone: "PHONE",
  aleatoria: "EVP",
};

/**
 * O tipo da chave no formato do Asaas. Quando o cadastro não guarda o tipo
 * (a ficha do proprietário PF não guarda), deduz pelo formato. Na dúvida —
 * 11 dígitos podem ser CPF ou celular —, o dígito verificador decide: CPF
 * válido é CPF; senão, telefone.
 */
export function tipoDaChave(chave: string, tipoCadastro?: string | null): TipoChaveAsaas | null {
  if (tipoCadastro && TIPO_DO_CADASTRO[tipoCadastro]) return TIPO_DO_CADASTRO[tipoCadastro];

  const c = chave.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) return "EMAIL";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c)) return "EVP";

  const d = c.replace(/\D/g, "");
  if (c.startsWith("+")) return "PHONE";
  if (d.length === 14) return "CNPJ";
  if (d.length === 11) return cpfValido(d) ? "CPF" : "PHONE";
  if (d.length === 10 || d.length === 13) return "PHONE";
  return null;
}

function cpfValido(cpf: string): boolean {
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  const dv = (base: string, peso: number) => {
    const soma = base.split("").reduce((s, n, i) => s + Number(n) * (peso - i), 0);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(cpf.slice(0, 9), 10) === Number(cpf[9]) && dv(cpf.slice(0, 10), 11) === Number(cpf[10]);
}

/** A chave no formato que o Asaas espera para cada tipo. */
export function normalizarChave(chave: string, tipo: TipoChaveAsaas): string {
  const c = chave.trim();
  if (tipo === "CPF" || tipo === "CNPJ") return c.replace(/\D/g, "");
  if (tipo === "PHONE") {
    const d = c.replace(/\D/g, "");
    return d.length === 13 && d.startsWith("55") ? `+${d}` : `+55${d}`;
  }
  if (tipo === "EMAIL") return c.toLowerCase();
  return c;
}

export type DadosTransferencia = {
  valor: number;
  chave: string;
  tipo: TipoChaveAsaas;
  descricao: string;
  /** Id do lote no nosso banco. */
  referencia: string;
};

export type TransferenciaAsaas = { id: string; status: string; failReason?: string | null };

/**
 * Pede uma transferência Pix. NÃO é idempotente do lado do Asaas — a garantia
 * de "uma vez só" é a trava do lote no nosso banco (ver `lib/repasse.ts`).
 * Com a validação por SMS ligada na conta, a transferência nasce pendente e só
 * sai quando alguém aprova no Asaas.
 */
export async function criarTransferencia(
  ambiente: AmbienteAsaas,
  d: DadosTransferencia,
): Promise<TransferenciaAsaas> {
  return chamar<TransferenciaAsaas>(configurar(ambiente), "POST", "/transfers", {
    value: d.valor,
    operationType: "PIX",
    pixAddressKey: normalizarChave(d.chave, d.tipo),
    pixAddressKeyType: d.tipo,
    description: d.descricao.slice(0, 140),
    externalReference: d.referencia,
  });
}
