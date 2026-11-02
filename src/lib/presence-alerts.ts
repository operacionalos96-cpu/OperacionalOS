"use client"

import { createElement } from "react"
import { format } from "date-fns"
import { toast } from "sonner"
import { getUser } from "@/config/team"
import { peopleFrom } from "@/lib/domain/areas"
import type { DailyPlan } from "@/lib/domain/presence"
import { dayChanges, type DayChange } from "@/lib/domain/work-sessions"
import { useDailyPlans, useMemberRoles } from "@/lib/modules"

/**
 * Avisos de presença para CEO e founders (ADR 0015): quando alguém faz o check-in, começa uma
 * tarefa ou pausa, aparece um pop-up na tela de quem lidera; o check-in também toca um som curto.
 * Fonte única: as mudanças da linha do dia (daily_plans), que já chegam em tempo real. Nada é
 * gravado; quem estava com o app fechado vê o estado atual em "Time agora" e o registro do dia na
 * página da pessoa.
 */
let started = false
export function startPresenceAlerts(meId: string, navigate: (href: string) => void) {
  if (started || !meId) return
  started = true
  unlockSound()
  // Base = a primeira carga completa: o que já estava no banco ao abrir o app não vira aviso.
  let known: Map<string, DailyPlan> | null = useDailyPlans.getState().loaded ? snapshot(useDailyPlans.getState().items) : null
  useDailyPlans.subscribe((s) => {
    if (!s.loaded) return
    if (!known) {
      known = snapshot(s.items)
      return
    }
    const people = peopleFrom(useMemberRoles.getState().items)
    const leader = people.ceoId === meId || people.founderIds.includes(meId)
    const today = format(new Date(), "yyyy-MM-dd")
    if (leader) {
      for (const plan of s.items) {
        if (plan.memberId === meId || plan.date !== today) continue
        const before = known.get(plan.id)
        if (before === plan) continue
        for (const change of dayChanges(before, plan)) show(plan.memberId, change, navigate)
      }
    }
    known = snapshot(s.items)
  })
}

const snapshot = (items: DailyPlan[]) => new Map(items.map((p) => [p.id, p]))

function show(memberId: string, change: DayChange, navigate: (href: string) => void) {
  const who = getUser(memberId)
  const text =
    change.kind === "checkin"
      ? { title: `${who.name} fez o check-in`, description: change.focus ? `Foco de hoje: ${change.focus}` : "Começou o dia." }
      : change.kind === "start"
        ? { title: `${who.name} começou uma tarefa`, description: change.title }
        : { title: `${who.name} pausou`, description: change.label }
  if (change.kind === "checkin") playChime()
  toast(text.title, {
    description: text.description,
    duration: 6000,
    icon: createElement("span", { className: "flex size-6 items-center justify-center rounded-full text-[11px] font-semibold text-white", style: { backgroundColor: who.color } }, who.initials),
    action: { label: "Ver", onClick: () => navigate(`/equipe/${memberId}`) },
  })
}

// ---------- som do check-in (Web Audio: sem arquivo, dois tons curtos e suaves) ----------

let audio: AudioContext | null = null

/** O navegador só libera som depois de um clique/tecla na página: prepara o áudio no primeiro gesto. */
function unlockSound() {
  if (typeof window === "undefined") return
  const unlock = () => {
    try {
      audio ??= new AudioContext()
      void audio.resume()
    } catch {}
  }
  window.addEventListener("pointerdown", unlock, { once: true })
  window.addEventListener("keydown", unlock, { once: true })
}

function playChime() {
  if (!audio || audio.state !== "running") return
  const now = audio.currentTime
  for (const [i, freq] of [880, 1318.5].entries()) {
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.type = "sine"
    osc.frequency.value = freq
    const t = now + i * 0.14
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(0.18, t + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45)
    osc.connect(gain).connect(audio.destination)
    osc.start(t)
    osc.stop(t + 0.5)
  }
}
