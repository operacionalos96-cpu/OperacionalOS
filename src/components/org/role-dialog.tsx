"use client"

import { useState } from "react"
import { toast } from "sonner"
import { ROLE_LEVELS, type OrgRole, type RoleLevel } from "@/lib/domain/org"
import { uid } from "@/lib/format"
import { useOrgRoles } from "@/lib/modules"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

const PRESET_COLORS = [
  "#2563eb", // Azul CEO / Tech
  "#7c3aed", // Roxo Founder / Operações
  "#059669", // Verde CFO / Finanças
  "#d97706", // Âmbar Marketing
  "#dc2626", // Vermelho Comercial
  "#0891b2", // Ciano Produto
  "#64748b", // Cinza Colaborador
]

export function RoleDialog({
  open,
  onOpenChange,
  roleToEdit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  roleToEdit?: OrgRole
}) {
  const saveRole = useOrgRoles((s) => s.save)
  const [title, setTitle] = useState(roleToEdit?.title ?? "")
  const [description, setDescription] = useState(roleToEdit?.description ?? "")
  const [level, setLevel] = useState<RoleLevel>(roleToEdit?.level ?? "operator")
  const [color, setColor] = useState(roleToEdit?.color ?? PRESET_COLORS[0])
  const [saving, setSaving] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      toast.error("Informe o título do cargo")
      return
    }

    setSaving(true)
    try {
      const roleId = roleToEdit?.id ?? uid()
      saveRole({
        id: roleId,
        title: title.trim(),
        description: description.trim() || undefined,
        level,
        color,
        active: true,
      })

      toast.success(roleToEdit ? "Cargo atualizado" : "Cargo criado com sucesso")
      onOpenChange(false)
    } catch {
      toast.error("Não foi possível salvar o cargo")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{roleToEdit ? "Editar Cargo" : "Novo Cargo"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Título do Cargo</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex.: CTO, Head de Growth, Tech Lead..."
                required
                autoFocus
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Descrição / Atribuições</label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="O que este cargo é responsável por fazer..."
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Nível de Acesso no Sistema</label>
              <div className="grid gap-2 pt-1">
                {ROLE_LEVELS.map((rl) => (
                  <label
                    key={rl.id}
                    className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 text-xs transition-colors ${
                      level === rl.id ? "border-primary bg-primary/5 font-medium" : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="roleLevel"
                      value={rl.id}
                      checked={level === rl.id}
                      onChange={() => setLevel(rl.id)}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="font-semibold text-foreground">{rl.label}</div>
                      <div className="text-muted-foreground">{rl.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Cor de Identificação</label>
              <div className="flex items-center gap-2 pt-1.5">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`h-6 w-6 rounded-full border-2 transition-transform ${
                      color === c ? "scale-110 border-foreground shadow-sm" : "border-transparent hover:scale-105"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Salvando..." : roleToEdit ? "Salvar Alterações" : "Criar Cargo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
