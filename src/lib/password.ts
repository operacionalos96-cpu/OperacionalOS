/** Política de senha (espelhe no painel: Authentication → Providers → Email → Password). */
export const MIN_PASSWORD = 12

export function passwordChecks(pw: string) {
  return [
    { label: `Pelo menos ${MIN_PASSWORD} caracteres`, ok: pw.length >= MIN_PASSWORD },
    { label: "Letra maiúscula e minúscula", ok: /[a-z]/.test(pw) && /[A-Z]/.test(pw) },
    { label: "Pelo menos um número", ok: /\d/.test(pw) },
    { label: "Pelo menos um símbolo (!@#…)", ok: /[^A-Za-z0-9]/.test(pw) },
  ]
}

export function passwordIsStrong(pw: string) {
  return passwordChecks(pw).every((c) => c.ok)
}
