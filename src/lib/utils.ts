import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Junta classes do Tailwind resolvendo conflito: `cn("px-2", cond && "px-4")`
 * fica só com `px-4`. É o utilitário que todo componente da shadcn/ui usa.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
