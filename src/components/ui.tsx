"use client";

import { forwardRef } from "react";
import Link from "next/link";

export function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-trilha-200 bg-white p-6 shadow-[0_1px_2px_rgba(21,38,110,0.05)]">
      <header className="mb-5 border-b border-trilha-100 pb-3">
        <h2 className="font-display text-xl font-semibold text-trilha-700">{title}</h2>
        {hint ? <p className="mt-1 text-sm text-trilha-400">{hint}</p> : null}
      </header>
      <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-6">{children}</div>
    </section>
  );
}

const spanClass: Record<number, string> = {
  1: "sm:col-span-1",
  2: "sm:col-span-2",
  3: "sm:col-span-3",
  4: "sm:col-span-4",
  6: "sm:col-span-6",
};

export function Field({
  label,
  error,
  span = 3,
  children,
  optional,
  hint,
}: {
  label: string;
  error?: string;
  span?: 1 | 2 | 3 | 4 | 6;
  children: React.ReactNode;
  optional?: boolean;
  hint?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${spanClass[span]}`}>
      <label className="font-display text-sm font-semibold tracking-wide text-trilha-700 uppercase">
        {label}
        {optional ? (
          <span className="font-body ml-1.5 text-xs font-normal normal-case text-trilha-400">
            opcional
          </span>
        ) : null}
      </label>
      {children}
      {hint && !error ? <p className="text-xs text-trilha-400">{hint}</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}

const control =
  "w-full rounded-md border border-trilha-200 bg-white px-3 py-2 text-[15px] text-trilha-900 placeholder:text-trilha-300 transition-colors hover:border-trilha-300 disabled:cursor-not-allowed disabled:bg-trilha-50 disabled:text-trilha-400 aria-[invalid=true]:border-red-400";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = "", ...props }, ref) {
    return <input ref={ref} className={`${control} ${className}`} {...props} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className = "", children, ...props }, ref) {
    return (
      <select ref={ref} className={`${control} ${className}`} {...props}>
        {children}
      </select>
    );
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className = "", rows = 3, ...props }, ref) {
  return <textarea ref={ref} rows={rows} className={`${control} ${className}`} {...props} />;
});

export const Checkbox = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { label: string }
>(function Checkbox({ label, className = "", ...props }, ref) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 py-2 text-[15px] text-trilha-900">
      <input
        ref={ref}
        type="checkbox"
        className={`size-4 rounded border-trilha-300 accent-trilha-500 ${className}`}
        {...props}
      />
      {label}
    </label>
  );
});

export function Button({
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" }) {
  const styles =
    variant === "primary"
      ? "bg-trilha-500 text-white hover:bg-trilha-700 disabled:bg-trilha-300"
      : "border border-trilha-200 bg-white text-trilha-700 hover:bg-trilha-50 disabled:text-trilha-300";

  return (
    <button
      className={`font-display inline-flex items-center justify-center rounded-md px-5 py-2.5 text-[15px] font-semibold tracking-wide transition-colors disabled:cursor-not-allowed ${styles} ${className}`}
      {...props}
    />
  );
}

export function Alert({
  children,
  tone = "erro",
}: {
  children: React.ReactNode;
  tone?: "erro" | "ok";
}) {
  const styles =
    tone === "erro"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-emerald-200 bg-emerald-50 text-emerald-800";
  return <p className={`rounded-md border px-4 py-3 text-sm ${styles}`}>{children}</p>;
}

type Acao = { href: string; label: string };

export function PageHeader({
  titulo,
  descricao,
  voltar,
  acao,
  acaoSecundaria,
}: {
  titulo: string;
  descricao?: string;
  voltar?: Acao;
  acao?: Acao;
  acaoSecundaria?: Acao;
}) {
  return (
    <div className="mb-8">
      {voltar ? (
        <Link
          href={voltar.href}
          className="font-display text-sm font-semibold tracking-wide text-trilha-500 uppercase underline underline-offset-2 hover:text-trilha-700"
        >
          ← {voltar.label}
        </Link>
      ) : null}
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-trilha-900">{titulo}</h1>
          {descricao ? <p className="mt-1 text-[15px] text-trilha-400">{descricao}</p> : null}
        </div>
        {acao || acaoSecundaria ? (
          <div className="flex flex-wrap items-center gap-2.5">
            {acaoSecundaria ? (
              <Link
                href={acaoSecundaria.href}
                className="font-display rounded-md border border-trilha-200 bg-white px-5 py-2.5 text-[15px] font-semibold tracking-wide text-trilha-700 transition-colors hover:bg-trilha-50"
              >
                {acaoSecundaria.label}
              </Link>
            ) : null}
            {acao ? (
              <Link
                href={acao.href}
                className="font-display rounded-md bg-trilha-500 px-5 py-2.5 text-[15px] font-semibold tracking-wide text-white transition-colors hover:bg-trilha-700"
              >
                {acao.label}
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function EmptyState({
  titulo,
  texto,
  acao,
}: {
  titulo: string;
  texto: string;
  acao?: { href: string; label: string };
}) {
  return (
    <div className="rounded-lg border border-dashed border-trilha-200 bg-white px-6 py-16 text-center">
      <p className="font-display text-xl font-semibold text-trilha-700">{titulo}</p>
      <p className="mx-auto mt-2 max-w-md text-[15px] text-trilha-400">{texto}</p>
      {acao ? (
        <Link
          href={acao.href}
          className="font-display mt-6 inline-block rounded-md bg-trilha-500 px-5 py-2.5 text-[15px] font-semibold tracking-wide text-white transition-colors hover:bg-trilha-700"
        >
          {acao.label}
        </Link>
      ) : null}
    </div>
  );
}

const STATUS_CORES: Record<string, string> = {
  disponivel: "bg-emerald-50 text-emerald-700 border-emerald-200",
  reservado: "bg-amber-50 text-amber-700 border-amber-200",
  em_negociacao: "bg-trilha-100 text-trilha-700 border-trilha-200",
  em_trilha: "bg-trilha-500 text-white border-trilha-500",
  indisponivel: "bg-slate-100 text-slate-600 border-slate-200",
};

export function StatusPill({ status, label }: { status: string; label: string }) {
  return (
    <span
      className={`font-display inline-block rounded-full border px-2.5 py-0.5 text-sm font-semibold tracking-wide ${
        STATUS_CORES[status] ?? "border-trilha-200 bg-trilha-50 text-trilha-700"
      }`}
    >
      {label}
    </span>
  );
}

/**
 * Cartão de número. Vira link quando há para onde ir — é assim que os
 * contadores levam para a lista já filtrada.
 */
export function Stat({
  valor,
  label,
  href,
  tom = "padrao",
}: {
  valor: number | string;
  label: string;
  href?: string;
  tom?: "padrao" | "positivo" | "atencao" | "destaque";
}) {
  const cores = {
    padrao: "text-trilha-700",
    positivo: "text-emerald-600",
    atencao: "text-amber-600",
    destaque: "text-trilha-500",
  } as const;
  const cor = cores[tom];
  const base = "group flex flex-col gap-1 rounded-lg border border-trilha-200 bg-white p-5";

  const conteudo = (clicavel: boolean) => (
    <>
      <span className={`font-display text-3xl font-bold tabular-nums ${cor}`}>{valor}</span>
      <span
        className={`font-display text-[13px] leading-tight font-semibold tracking-[0.08em] text-trilha-400 uppercase group-hover:text-trilha-500 ${
          clicavel ? "underline underline-offset-2" : ""
        }`}
      >
        {label}
      </span>
    </>
  );

  return href ? (
    <Link
      href={href}
      className={`${base} transition-colors hover:border-trilha-500 hover:bg-trilha-50`}
    >
      {conteudo(true)}
    </Link>
  ) : (
    <div className={base}>{conteudo(false)}</div>
  );
}
