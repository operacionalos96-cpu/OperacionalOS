"use client"

import { useState } from "react"
import { toast } from "sonner"
import { ROLE_LEVELS, type RoleLevel } from "@/lib/domain/org"
import { uid } from "@/lib/format"
import { recordEvent } from "@/lib/event-service"
import { useMemberRoles, useOrgRoles } from "@/lib/modules"
import { useStore } from "@/lib/store"
import { supabaseBrowser } from "@/lib/supabase/client"
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
      const response = await fetch("/api/equipe/convites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: cleanEmail,
          displayName: displayName.trim(),
          roleLevel,
        }),
      })
      const result = await response.json().catch(() => ({})) as { error?: string; message?: string; ok?: boolean; teamId?: string }
      if (!response.ok || !result.ok) {
        toast.error(result.error || "Não foi possível enviar o convite")
        return
      }

      // A API de servidor cria a conta de autenticação e a autorização em members.
      // O vínculo opcional de cargo organizacional continua usando o repositório atual.
      if (initialRoleId) {
        const { data: createdMember } = await supabaseBrowser()
          .from("members")
          .select("team_id")
          .eq("email", cleanEmail)
          .maybeSingle()
        if (createdMember?.team_id) {
          saveMemberRole({
            id: uid(),
            memberId: String(createdMember.team_id),
            roleId: initialRoleId,
            isPrimary: true,
            assignedAt: new Date().toISOString(),
            assignedBy: meId,
          })
        }
      }

      recordEvent({
        type: "lead.created",
        entity: { type: "lead", id: cleanEmail },
        actor: { type: "human", id: meId },
        metadata: {
          action: "member_invited",
          email: cleanEmail,
          displayName,
          roleLevel,
        },
      })

      await refreshOrgMembers()
      toast.success("Convite enviado", { description: result.message || `${cleanEmail} receberá um e-mail para definir a senha.` })
      setEmail("")
      setDisplayName("")
      setRoleLevel("operator")
      setInitialRoleId("")
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
                placeholder="nome@empresa.com.br"
                required
                autoFocus
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Enviaremos um convite para este e-mail. A pessoa definirá a própria senha.
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
              {saving ? "Enviando convite..." : "Enviar Convite"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
