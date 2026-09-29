"use client"

import { useEffect, useState } from "react"
import { CheckIcon, XIcon } from "lucide-react"
import { supabaseBrowser } from "@/lib/supabase/client"
import { passwordChecks, passwordIsStrong } from "@/lib/password"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AuthLayout } from "@/components/shared/auth-layout"

/** Chega aqui pelo link do e-mail (/auth/confirm já criou a sessão temporária). */
export default function ResetPasswordPage() {
  const [ready, setReady] = useState<boolean | null>(null)
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabaseBrowser()
      .auth.getUser()
      .then(({ data }) => setReady(!!data.user))
  }, [])

  const checks = passwordChecks(password)
  const strong = passwordIsStrong(password)
  const matches = password.length > 0 && password === confirm

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!strong || !matches || busy) return
    setBusy(true)
    setError(null)
    const sb = supabaseBrowser()
    const { error: updateError } = await sb.auth.updateUser({ password })
    if (updateError) {
      setError(
        updateError.code === "same_password"
          ? "A nova senha precisa ser diferente da atual."
          : updateError.code === "weak_password"
            ? "Senha fraca ou já vazada na internet. Escolha outra."
            : "Não foi possível salvar. Peça um novo link.",
      )
      setBusy(false)
      return
    }
    // Encerra todas as sessões (inclusive em outros aparelhos) e pede login com a senha nova.
    await sb.auth.signOut({ scope: "global" })
    window.location.href = "/login"
  }

  return (
    <AuthLayout>
      <h1 className="text-xl font-semibold tracking-tight">Nova senha</h1>
      {ready === false ? (
        <>
          <p className="t-desc mt-1">Link inválido ou expirado.</p>
          <Button className="mt-5 w-full" onClick={() => (window.location.href = "/login")}>
            Voltar ao login
          </Button>
        </>
      ) : (
        <form onSubmit={submit} className="mt-5 grid gap-4">
          <p className="t-desc -mt-3">Depois de salvar, você entra de novo com a senha nova em todos os aparelhos.</p>
          <label className="grid gap-1.5">
            <span className="t-label">Nova senha</span>
            <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-10" autoFocus />
          </label>
          <ul className="grid gap-1 text-xs">
            {checks.map((c) => (
              <li key={c.label} className={cn("flex items-center gap-1.5", c.ok ? "text-success" : "text-muted-foreground")}>
                {c.ok ? <CheckIcon className="size-3.5" /> : <XIcon className="size-3.5" />}
                {c.label}
              </li>
            ))}
          </ul>
          <label className="grid gap-1.5">
            <span className="t-label">Repita a senha</span>
            <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="h-10" />
          </label>
          {confirm && !matches && <p className="text-xs text-danger">As senhas não são iguais.</p>}
          {error && <p className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
          <Button type="submit" className="h-10" disabled={!strong || !matches || busy || !ready}>
            {busy ? "Salvando…" : "Salvar nova senha"}
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
