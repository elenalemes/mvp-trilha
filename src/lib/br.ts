/** Validação, formatação e listas do domínio brasileiro. */

const onlyDigits = (value: string) => value.replace(/\D/g, "");

export function isValidCPF(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  const digit = (slice: number) => {
    let sum = 0;
    for (let i = 0; i < slice; i++) sum += Number(cpf[i]) * (slice + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

export function isValidCNPJ(value: string): boolean {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;

  const digit = (slice: number) => {
    const weights =
      slice === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < slice; i++) sum += Number(cnpj[i]) * weights[i];
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  return digit(12) === Number(cnpj[12]) && digit(13) === Number(cnpj[13]);
}

export const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
export const isValidPhone = (value: string) => [10, 11].includes(onlyDigits(value).length);

// ---- máscaras -------------------------------------------------------------

export function maskCPF(value: string): string {
  return onlyDigits(value)
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

export function maskCNPJ(value: string): string {
  return onlyDigits(value)
    .slice(0, 14)
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

export function maskPhone(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 10) {
    return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d{1,4})$/, "$1-$2");
  }
  return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d{1,4})$/, "$1-$2");
}

export const stripMask = onlyDigits;

// ---- dinheiro e números ---------------------------------------------------

export const formatBRL = (value?: number | string | null) =>
  value === null || value === undefined || value === ""
    ? "—"
    : Number(value).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        minimumFractionDigits: 2,
      });

export const formatArea = (value?: number | string | null) =>
  value === null || value === undefined || value === ""
    ? "—"
    : `${Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} m²`;

/** "1.250,50" ou "1250.50" → 1250.5 */
export function parseDecimal(value: string): number | null {
  const cleaned = value.trim().replace(/\./g, "").replace(",", ".");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// ---- listas ---------------------------------------------------------------

export const PIX_KEY_TYPES = [
  { value: "cpf", label: "CPF" },
  { value: "cnpj", label: "CNPJ" },
  { value: "email", label: "E-mail" },
  { value: "telefone", label: "Telefone" },
  { value: "aleatoria", label: "Chave aleatória" },
] as const;

export const MARITAL_STATUSES = [
  { value: "solteiro", label: "Solteiro(a)" },
  { value: "casado", label: "Casado(a)" },
  { value: "uniao_estavel", label: "União estável" },
  { value: "divorciado", label: "Divorciado(a)" },
  { value: "viuvo", label: "Viúvo(a)" },
] as const;

export const IMOVEL_TIPOS = [
  { value: "apartamento", label: "Apartamento" },
  { value: "casa", label: "Casa" },
  { value: "sala_comercial", label: "Sala comercial" },
  { value: "terreno", label: "Terreno" },
  { value: "outro", label: "Outro" },
] as const;

export const IMOVEL_STATUS = [
  { value: "disponivel", label: "Disponível" },
  { value: "reservado", label: "Reservado" },
  { value: "em_negociacao", label: "Em negociação" },
  { value: "em_trilha", label: "Em Trilha" },
  { value: "indisponivel", label: "Indisponível" },
] as const;

export const POSICOES_SOLARES = ["Norte", "Sul", "Leste", "Oeste", "Nordeste", "Noroeste", "Sudeste", "Sudoeste"] as const;

const findLabel = (list: readonly { value: string; label: string }[], value?: string | null) =>
  list.find((i) => i.value === value)?.label ?? "—";

export const pixTypeLabel = (v?: string | null) => findLabel(PIX_KEY_TYPES, v);
export const maritalLabel = (v?: string | null) => findLabel(MARITAL_STATUSES, v);
export const imovelTipoLabel = (v?: string | null) => findLabel(IMOVEL_TIPOS, v);
export const imovelStatusLabel = (v?: string | null) => findLabel(IMOVEL_STATUS, v);
