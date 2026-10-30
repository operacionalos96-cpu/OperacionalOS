"use client"

import { useState } from "react"
import { toast } from "sonner"
import { leaderOfMember, wouldCreateHierarchyCycle, type MemberRole, type OrgMember } from "@/lib/domain/org"
import { uid } from "@/lib/format"
import { useMemberRoles, useOrgRoles } from "@/lib/modules"
import { useStore } from "@/lib/store"
import { getUser } from "@/config/team"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { RoleBadge } from "./role-badge"

export function AssignRoleDialog({
  open,
  onOpenChange,
  targetMember,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  targetMember: OrgMember
}) {
  const orgRoles = useOrgRoles((s) => s.items)
  const memberRoles = useMemberRoles((s) => s.items)
  const saveMemberRole = useMemberRoles((s) => s.save)
  const removeMemberRole = useMemberRoles((s) => s.remove)
  const allMembers = useStore((s) => s.orgMembers)
  const meId = useStore((s) => s.meId)

  // Cargos atuais do membro
  const currentAssignments = memberRoles.filter((mr) => mr.memberId === targetMember.teamId)
  const currentRoleIds = new Set(currentAssignments.map((mr) => mr.roleId))
  const currentPrimaryId = currentAssignments.find((mr) => mr.isPrimary)?.roleId ?? currentAssignments[0]?.roleId
  const currentLeaderId = leaderOfMember(targetMember.teamId, memberRoles)

  const [selectedRoleIds, setSelectedRoleIds] = useState<Set<string>>(new Set(currentRoleIds))
  const [primaryRoleId, setPrimaryRoleId] = useState<string | undefined>(currentPrimaryId)
  const [reportsTo, setReportsTo] = useState<string | undefined>(currentLeaderId)
  const [saving, setSaving] = useState(false)

  const toggleRole = (roleId: string) => {
    setSelectedRoleIds((prev) => {
      const next = new Set(prev)
      if (next.has(roleId)) {
        next.delete(roleId)
        if (primaryRoleId === roleId) {
          const remaining = Array.from(next)
          setPrimaryRoleId(remaining[0])
        }
      } else {
        next.add(roleId)
        if (!primaryRoleId) {
          setPrimaryRoleId(roleId)
        }
      }
      return next
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (reportsTo && wouldCreateHierarchyCycle(targetMember.teamId, reportsTo, memberRoles)) {
      toast.error("Hierarquia inválida", {
        description: "Essa escolha criaria um ciclo hierárquico na árvore de subordinação.",
      })
      return
    }

    setSaving(true)
    try {
      const now = new Date().toISOString()

      // Remover atribuições desmarcadas
      for (const assignment of currentAssignments) {
        if (!selectedRoleIds.has(assignment.roleId)) {
          removeMemberRole(assignment.id)
        }
      }

      // Adicionar ou atualizar atribuições selecionadas
      for (const roleId of selectedRoleIds) {
        const existing = currentAssignments.find((a) => a.roleId === roleId)
        const isPrimary = roleId === primaryRoleId
        saveMemberRole({
          id: existing?.id ?? uid(),
          memberId: targetMember.teamId,
          roleId,
          isPrimary,
          reportsToMemberId: reportsTo || undefined,
          assignedAt: existing?.assignedAt ?? now,
          assignedBy: existing?.assignedBy ?? meId,
        })
      }

      toast.success("Cargos e hierarquia atualizados")
      onOpenChange(false)
    } catch {
      toast.error("Erro ao salvar atribuições")
    } finally {
      setSaving(false)
    }
  }

  const userMeta = getUser(targetMember.teamId)
  const availableLeaders = allMembers.filter((m) => m.teamId !== targetMember.teamId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Atribuir Cargos & Hierarquia</DialogTitle>
          </DialogHeader>

          <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white shadow-sm"
              style={{ backgroundColor: userMeta.color }}
            >
              {userMeta.initials}
            </div>
            <div>
              <div className="font-semibold text-foreground">{targetMember.displayName || userMeta.name}</div>
              <div className="text-xs text-muted-foreground">{targetMember.email}</div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">
                Cargos Exercidos (pode selecionar múltiplos)
              </label>
              <div className="mt-1.5 grid max-h-48 gap-1.5 overflow-y-auto rounded-lg border p-2">
                {orgRoles.length === 0 ? (
                  <p className="p-2 text-xs text-muted-foreground">Nenhum cargo cadastrado.</p>
                ) : (
                  orgRoles.map((role) => {
                    const isSelected = selectedRoleIds.has(role.id)
                    const isPrimary = primaryRoleId === role.id
                    return (
                      <div
                        key={role.id}
                        className={`flex items-center justify-between rounded-md p-2 text-xs transition-colors ${
                          isSelected ? "bg-accent/60 font-medium" : "hover:bg-muted/40"
                        }`}
                      >
                        <label className="flex flex-1 cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleRole(role.id)}
                            className="rounded"
                          />
                          <RoleBadge role={role} />
                        </label>

                        {isSelected && (
                          <button
                            type="button"
                            onClick={() => setPrimaryRoleId(role.id)}
                            className={`rounded px-1.5 py-0.5 text-xs uppercase font-bold transition-colors ${
                              isPrimary
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:bg-muted"
                            }`}
                          >
                            {isPrimary ? "Principal" : "Tornar Principal"}
                          </button>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">
                Superior Imediato (a quem responde na hierarquia)
              </label>
              <select
                value={reportsTo ?? ""}
                onChange={(e) => setReportsTo(e.target.value || undefined)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground shadow-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
              >
                <option value="">Nenhum (Responde diretamente aos Sócios / Raiz)</option>
                {availableLeaders.map((m) => {
                  const leaderUser = getUser(m.teamId)
                  return (
                    <option key={m.teamId} value={m.teamId}>
                      {m.displayName || leaderUser.name} ({m.email})
                    </option>
                  )
                })}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                O organograma usa essa ligação para desenhar a relação de subordinação direta.
              </p>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Salvando..." : "Salvar Atribuições"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
