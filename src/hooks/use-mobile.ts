import * as React from "react"

const MOBILE_BREAKPOINT = 768
const CONSULTA = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

/**
 * Se a tela é de celular. Versão com `useSyncExternalStore` em vez do
 * `useEffect` + `setState` que vem da shadcn: o React Compiler do projeto
 * recusa setState direto dentro de efeito. O comportamento é o mesmo.
 */
function assinar(avisar: () => void) {
  const mql = window.matchMedia(CONSULTA)
  mql.addEventListener("change", avisar)
  return () => mql.removeEventListener("change", avisar)
}

export function useIsMobile() {
  return React.useSyncExternalStore(
    assinar,
    () => window.matchMedia(CONSULTA).matches,
    () => false,
  )
}
