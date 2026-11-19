/**
 * Ponte do app para PC (desktop/src/preload.ts): `window.opos`. No navegador ela não existe, e versões
 * antigas do app podem não ter todas as funções. Por isso tudo aqui é opcional e cada uso confere antes.
 * Só o que o site usa está tipado.
 */
export interface OposFloat {
  /** Bolinha na área de trabalho quando o app é minimizado. */
  get(): Promise<{ enabled: boolean }>
  set(enabled: boolean): Promise<{ enabled: boolean }>
}

export interface OposBridge {
  isApp?: boolean
  float?: Partial<OposFloat>
}

declare global {
  interface Window {
    opos?: OposBridge
  }
}

/** A bolinha da área de trabalho, se este app tiver a função; senão, null (navegador ou app antigo). */
export function desktopFloat(): OposFloat | null {
  if (typeof window === "undefined") return null
  const f = window.opos?.float
  return f && typeof f.get === "function" && typeof f.set === "function" ? (f as OposFloat) : null
}
