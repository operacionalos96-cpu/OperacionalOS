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
      const sb = supabaseBrowser()
      const newTeamId = `u_${uid().slice(0, 8)}`

      // 1. Inserir na tabela members
      const { error: insertError } = await sb.from("members").insert({
        email: cleanEmail,
        team_id: newTeamId,
        display_name: displayName.trim() || undefined,
        role_level: roleLevel,
        active: true,
      })

      if (insertError) {
        if (insertError.code === "23505") {
          toast.error("Este e-mail já está cadastrado na equipe")
        } else {
          toast.error("Erro ao cadastrar membro", { description: insertError.message })
        }
        return
      }

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

      // 3. Registrar no log de auditoria
      recordEvent({
        type: "lead.created", // utilizando o event_type padrão com metadado
        entity: { type: "lead", id: newTeamId },
        actor: { type: "human", id: meId },
        metadata: {
          action: "member_added",
          email: cleanEmail,
          displayName,
          roleLevel,
          teamId: newTeamId,
        },
      })

      await refreshOrgMembers()
      toast.success("Membro cadastrado com sucesso", {
        description: `${cleanEmail} agora tem acesso ao OperacionalOS.`,
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
                {ROLE_LEVELS.map((rl) => (
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
