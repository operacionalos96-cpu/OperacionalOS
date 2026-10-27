
"use client"

import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { EyeIcon, EyeOffIcon, LockIcon, MailIcon } from "lucide-react"
import { supabaseBrowser } from "@/lib/supabase/client"
import { supabaseConfigured } from "@/lib/supabase/env"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AuthLayout } from "@/components/shared/auth-layout"

/** Depois de 5 erros seguidos, o formulário trava por 60s (além do limite do próprio Supabase). */
const MAX_TRIES = 5
const LOCK_MS = 60_000
const LOCK_KEY = "operacional:login-lock"

export default function LoginPage() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  )
}

/** Só aceita caminhos internos ("/tarefas"), nunca outro site ("//x.com", "https://…"). */
function safeNext(raw: string | null) {
  return raw && raw.startsWith("/") && !raw.startsWith("//") && !raw.includes("\\")
    ? raw
    : "/"
}

function Login() {
  const params = useSearchParams()
  const [mode, setMode] = useState<"entrar" | "esqueci">("entrar")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(
    params.get("erro") === "config"
      ? "O sistema ainda não foi ligado ao Supabase (arquivo .env.local)."
      : params.get("erro") === "link"
        ? "Link inválido ou expirado. Peça um novo."
        : null,
  )
  const [info, setInfo] = useState<string | null>(null)
  const [lockedUntil, setLockedUntil] = useState(0)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    try {
      const saved = JSON.parse(
        sessionStorage.getItem(LOCK_KEY) ?? "null",
      ) as { until: number } | null

      if (saved && saved.until > Date.now()) {
        setLockedUntil(saved.until)
      }
    } catch {}
  }, [])

  useEffect(() => {
    if (lockedUntil <= Date.now()) return

    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [lockedUntil])

  const locked = lockedUntil > now
  const secondsLeft = Math.ceil((lockedUntil - now) / 1000)

  function registerFailure() {
    let tries = 1

    try {
      tries =
        Number(sessionStorage.getItem(`${LOCK_KEY}:n`) ?? "0") + 1

      sessionStorage.setItem(`${LOCK_KEY}:n`, String(tries))

      if (tries >= MAX_TRIES) {
        const until = Date.now() + LOCK_MS

        sessionStorage.setItem(LOCK_KEY, JSON.stringify({ until }))
        sessionStorage.setItem(`${LOCK_KEY}:n`, "0")
        setLockedUntil(until)
        setNow(Date.now())
      }
    } catch {}
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault()

    if (locked || busy) return

    setBusy(true)
    setError(null)
    setInfo(null)

    const sb = supabaseBrowser()

    try {
      const { error: authError } = await sb.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      })

      if (authError) {
        registerFailure()

        // Mensagem genérica de propósito: não revela se o e-mail existe.
        setError(
          authError.status === 429
            ? "Muitas tentativas. Aguarde alguns minutos."
            : "E-mail ou senha incorretos.",
        )
        setBusy(false)
        return
      }

      // Obtém a identidade autenticada antes de consultar os membros.
      const {
        data: { user },
        error: userError,
      } = await sb.auth.getUser()

      if (userError || !user?.email) {
        await sb.auth.signOut()
        setError(
          "Não foi possível validar sua conta. Tente entrar novamente.",
        )
        setBusy(false)
        return
      }

      // Busca somente o registro correspondente ao usuário autenticado.
      const { data: member, error: memberError } = await sb
        .from("members")
        .select("team_id")
        .ilike("email", user.email)
        .maybeSingle()

      if (memberError) {
        console.error("Erro ao validar membro:", memberError)

        await sb.auth.signOut()
        setError("Não foi possível validar seu acesso. Tente novamente.")
        setBusy(false)
        return
      }

      if (!member) {
        await sb.auth.signOut()
        setError("Esta conta não tem acesso ao Operacional OS.")
        setBusy(false)
        return
      }

      // Login validado: limpa o contador de falhas.
      try {
        sessionStorage.removeItem(`${LOCK_KEY}:n`)
      } catch {}

      // Mantém o redirecionamento interno original.
      window.location.href = safeNext(params.get("voltar"))
    } catch (err) {
      console.error("Erro inesperado no login:", err)

      setError("Ocorreu um erro ao entrar. Tente novamente.")
      setBusy(false)
    }
  }

  async function sendReset(e: React.FormEvent) {
    e.preventDefault()

    if (busy) return

    setBusy(true)
    setError(null)
    setInfo(null)

    try {
      await supabaseBrowser().auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        {
          redirectTo: `${window.location.origin}/auth/confirm?next=/redefinir-senha`,
        },
      )

      // Mesma resposta sempre (existindo ou não o e-mail).
      setInfo(
        "Se este e-mail tiver acesso, você vai receber um link para criar uma nova senha.",
      )
    } catch (err) {
      console.error("Erro ao solicitar redefinição de senha:", err)
      setError("Não foi possível solicitar a redefinição. Tente novamente.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout>
      <h1 className="text-xl font-semibold tracking-tight">
        {mode === "entrar" ? "Entrar" : "Recuperar senha"}
      </h1>

      <p className="t-desc mt-1">
        {mode === "entrar"
          ? "Acesso restrito à equipe do Operacional OS."
          : "Enviaremos um link para o seu e-mail."}
      </p>

      <form
        onSubmit={mode === "entrar" ? signIn : sendReset}
        className="mt-6 grid gap-4"
      >
        <Field icon={MailIcon} label="E-mail">
          <Input
            type="email"
            autoComplete="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@empresa.com"
            className="h-10 pl-9"
            disabled={!supabaseConfigured}
          />
        </Field>

        {mode === "entrar" && (
          <Field icon={LockIcon} label="Senha">
            <Input
              type={show ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••"
              className="h-10 pr-10 pl-9"
              disabled={!supabaseConfigured}
            />

            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={show ? "Esconder senha" : "Mostrar senha"}
            >
              {show ? (
                <EyeOffIcon className="size-4" />
              ) : (
                <EyeIcon className="size-4" />
              )}
            </button>
          </Field>
        )}

        {error && (
          <p className="animate-enter rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        {info && (
          <p className="animate-enter rounded-md border border-success/30 bg-success-soft px-3 py-2 text-sm text-success">
            {info}
          </p>
        )}

        <Button
          type="submit"
          className="h-10"
          disabled={busy || locked || !supabaseConfigured}
        >
          {locked
            ? `Aguarde ${secondsLeft}s`
            : busy
              ? "Aguarde…"
              : mode === "entrar"
                ? "Entrar"
                : "Enviar link"}
        </Button>
      </form>

      <button
        type="button"
        onClick={() => {
          setMode(mode === "entrar" ? "esqueci" : "entrar")
          setError(null)
          setInfo(null)
        }}
        className="mt-4 text-sm text-muted-foreground hover:text-foreground"
      >
        {mode === "entrar"
          ? "Esqueci minha senha"
          : "← Voltar para o login"}
      </button>
    </AuthLayout>
  )
}

function Field({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="grid gap-1.5">
      <span className="t-label">{label}</span>

      <span className="relative">
        <Icon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        {children}
      </span>
    </label>
  )
}
