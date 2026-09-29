"use client"

import { useCallback, useEffect, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { CheckCircle2Icon, Loader2Icon, PlugIcon, RefreshCwIcon, TriangleAlertIcon } from "lucide-react"
import type { ContentAccount } from "@/lib/domain/content"
import { relative } from "@/lib/format"
import { supabaseBrowser } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

export interface Connection {
  id: string
  platform: "youtube" | "tiktok"
  display_name: string | null
  status: "ativo" | "expirado"
  last_sync_at: string | null
  last_sync_error: string | null
}

export const CONNECTABLE = new Set(["youtube", "tiktok"])

/** Status das conexões (tabela sem tokens; membros só leem). */
export function useConnections() {
  const [map, setMap] = useState<Map<string, Connection>>(new Map())
  const reload = useCallback(async () => {
    const { data } = await supabaseBrowser()
      .from("integration_accounts")
      .select("id, platform, display_name, status, last_sync_at, last_sync_error")
    setMap(new Map((data ?? []).map((c) => [c.id, c as Connection])))
  }, [])
  useEffect(() => {
    reload()
  }, [reload])
  return { connections: map, reload }
}

export function ConnectionBadge({ account, connection, onChanged }: { account: ContentAccount; connection?: Connection; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  if (!CONNECTABLE.has(account.platform)) return null

  if (!connection) {
    return (
      <a
        href={`/api/integracoes/${account.platform}/conectar?conta=${encodeURIComponent(account.id)}`}
        className="inline-flex h-6 items-center gap-1 rounded-md border px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
        title="Conectar via API para puxar métricas automaticamente"
      >
        <PlugIcon className="size-3" /> Conectar
      </a>
    )
  }

  async function disconnect() {
    if (!window.confirm(`Desconectar ${connection!.display_name ?? "esta conta"}? As métricas param de atualizar sozinhas.`)) return
    setBusy(true)
    const res = await fetch("/api/integracoes/desconectar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conta: account.id }) })
    setBusy(false)
    if (res.ok) {
      toast("Conta desconectada")
      onChanged()
    } else toast.error("Não foi possível desconectar.")
  }

  const problem = connection.status === "expirado" || !!connection.last_sync_error
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cn("inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11px] font-medium", problem ? "bg-warning-soft text-warning" : "bg-success-soft text-success")}
        title={connection.last_sync_error ?? (connection.last_sync_at ? `Última atualização ${relative(connection.last_sync_at)}` : "Conectado")}
      >
        {problem ? <TriangleAlertIcon className="size-3" /> : <CheckCircle2Icon className="size-3" />}
        {problem ? "Reconectar" : "API"}
      </span>
      {problem ? (
        <a href={`/api/integracoes/${account.platform}/conectar?conta=${encodeURIComponent(account.id)}`} className="text-[11px] text-muted-foreground underline hover:text-foreground">
          conectar de novo
        </a>
      ) : (
        <button onClick={disconnect} disabled={busy} className="text-[11px] text-muted-foreground hover:text-danger">
          desconectar
        </button>
      )}
    </span>
  )
}

/** "Atualizar métricas agora" — chama a sincronização no servidor. */
export function SyncMetricsButton({ onDone }: { onDone?: () => void }) {
  const [busy, setBusy] = useState(false)
  async function run() {
    setBusy(true)
    try {
      const res = await fetch("/api/integracoes/sincronizar", { method: "POST" })
      const json = (await res.json()) as { updated?: number; errors?: string[]; error?: string }
      if (!res.ok) throw new Error(json.error)
      if (json.errors?.length) toast.warning(`${json.updated ?? 0} publicações atualizadas`, { description: json.errors.join(" · ") })
      else toast.success(json.updated ? `${json.updated} publicações atualizadas pela API` : "Nada para atualizar", {
        description: json.updated ? undefined : "Conecte as contas e cole o link dos posts publicados.",
      })
      onDone?.()
    } catch {
      toast.error("Não foi possível atualizar as métricas.")
    } finally {
      setBusy(false)
    }
  }
  return (
    <Button variant="outline" onClick={run} disabled={busy}>
      {busy ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />} Atualizar métricas
    </Button>
  )
}

const MESSAGES: Record<string, [kind: "success" | "error" | "info", text: string]> = {
  "conectado-youtube": ["success", "YouTube conectado. As métricas passam a vir da API."],
  "conectado-tiktok": ["success", "TikTok conectado. As métricas passam a vir da API."],
  cancelada: ["info", "Conexão cancelada."],
  "sessao-expirada": ["error", "A tentativa de conexão expirou. Tente de novo."],
  "nao-configurada": ["error", "Integração ainda não configurada no servidor (chaves do app)."],
  "conta-invalida": ["error", "Conta inválida para esta plataforma."],
  "plataforma-invalida": ["error", "Plataforma não suportada."],
  falhou: ["error", "A plataforma recusou a conexão. Confira o app e tente de novo."],
}

/** Mostra o resultado da volta da plataforma (?integracao=...) e limpa a URL. */
export function IntegrationResultToast({ onResult }: { onResult?: () => void }) {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const code = params.get("integracao")
  useEffect(() => {
    if (!code) return
    const [kind, text] = MESSAGES[code] ?? ["error", "Não foi possível conectar."]
    toast[kind](text)
    onResult?.()
    router.replace(`${pathname}?aba=contas`, { scroll: false })
  }, [code, pathname, router, onResult])
  return null
}
