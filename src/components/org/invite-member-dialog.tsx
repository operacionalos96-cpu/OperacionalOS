"use client"

import { useState } from "react"
import { toast } from "sonner"
import { ROLE_LEVELS, type RoleLevel } from "@/lib/domain/org"
import { uid } from "@/lib/format"
import { useMemberRoles, useOrgRoles } from "@/lib/modules"
import { useStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

export function InviteMemberDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const orgRoles = useOrgRoles((s) => s.items)
  const saveMemberRole = useMemberRoles((s) => s.save)
  const refreshOrgMembers = useStore((s) => s.refreshOrgMembers)
  const meId = useStore((s) => s.meId)

  const [email, setEmail] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [roleLevel, setRoleLevel] = useState<RoleLevel>("operator")
  const [initialRoleId, setInitialRoleId] = useState<string>("")
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleanEmail = email.trim().toLowerCase()
    if (!cleanEmail || !cleanEmail.includes("@")) {
      toast.error("Informe um e-mail válido")
      return
    }

    setSaving(true)
    try {
      // 1. O servidor confere a permissão, envia o convite por e-mail, cadastra o membro e registra
      //    a auditoria (/api/equipe/convites). O navegador não grava em `members` (ADR 0005).
      const res = await fetch("/api/equipe/convites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail, displayName: displayName.trim(), roleLevel }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string; teamId?: string; message?: string }
      if (!res.ok || !body.teamId) {
        toast.error("Não foi possível convidar", { description: body.error ?? "Tente de novo em instantes." })
        return
      }
      const newTeamId = body.teamId

      // 2. Se um cargo inicial foi selecionado, atribuir
      if (initialRoleId) {
        saveMemberRole({
          id: uid(),
          memberId: newTeamId,
          roleId: initialRoleId,
          isPrimary: true,
          assignedAt: new Date().toISOString(),
          assignedBy: meId,
        })
      }

      await refreshOrgMembers()
      toast.success("Convite enviado", {
        description: body.message ?? `${cleanEmail} vai receber um e-mail para definir a senha.`,
      })
      onOpenChange(false)
    } catch {
      toast.error("Falha inesperada ao cadastrar")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Adicionar Membro à Equipe</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">E-mail do Colaborador</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colaborador@hzk.com.br"
                required
                autoFocus
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                O colaborador usará este e-mail para fazer login no sistema.
              </p>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Nome de Exibição</label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Ex.: Lucas Mendes"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Nível de Acesso (Permissões)</label>
              <select
                value={roleLevel}
                onChange={(e) => setRoleLevel(e.target.value as RoleLevel)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground shadow-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
              >
                {/* Owner não é concedido por convite (só por outro owner, depois): a rota recusa. */}
                {ROLE_LEVELS.filter((rl) => rl.id !== "owner").map((rl) => (
                  <option key={rl.id} value={rl.id}>
                    {rl.label} — {rl.description}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Cargo Inicial (Opcional)</label>
              <select
                value={initialRoleId}
                onChange={(e) => setInitialRoleId(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground shadow-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
              >
                <option value="">Nenhum cargo inicial</option>
                {orgRoles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Adicionando..." : "Cadastrar Membro"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
