import { beforeEach, describe, expect, it, vi } from "vitest"
import { format } from "date-fns"
import { create } from "zustand"
import type { DailyPlan } from "@/lib/domain/presence"

// Coleções em memória no lugar do Supabase; o pop-up (sonner) é espionado.
const stores = vi.hoisted(() => ({ plans: null as unknown, roles: null as unknown }))
vi.mock("@/lib/modules", () => {
  stores.plans = create<{ items: DailyPlan[]; loaded: boolean }>(() => ({ items: [], loaded: false }))
  stores.roles = create<{ items: { memberId: string; roleId: string }[] }>(() => ({ items: [{ memberId: "u1", roleId: "founder" }, { memberId: "u2", roleId: "founder" }] }))
  return { useDailyPlans: stores.plans, useMemberRoles: stores.roles }
})
const toast = vi.hoisted(() => vi.fn())
vi.mock("sonner", () => ({ toast }))

type Store<T> = { setState(p: Partial<T>): void; getState(): T }
const plans = () => stores.plans as Store<{ items: DailyPlan[]; loaded: boolean }>
// Data local, como o app (em UTC, à noite no Brasil já seria amanhã).
const today = format(new Date(), "yyyy-MM-dd")
const row = (memberId: string, over: Partial<DailyPlan> = {}): DailyPlan => ({ id: `${memberId}:${today}`, memberId, date: today, ...over })

describe("avisos de presença para CEO e founders (ADR 0015)", () => {
  beforeEach(() => toast.mockClear())

  it("o que já existia ao abrir não avisa; check-in, início e pausa de outra pessoa avisam; os meus não", async () => {
    const { startPresenceAlerts } = await import("./presence-alerts")
    startPresenceAlerts("u1", () => {})
    plans().setState({ items: [row("u3", { checkedInAt: "2026-11-01T08:00:00Z" })], loaded: true })
    expect(toast).not.toHaveBeenCalled()

    plans().setState({ items: [row("u3", { checkedInAt: "2026-11-01T08:00:00Z" }), row("u_rafael", { checkedInAt: new Date().toISOString(), focus: "Landing" })] })
    expect(toast).toHaveBeenCalledTimes(1)
    expect(toast.mock.calls[0][1]).toMatchObject({ description: "Foco de hoje: Landing" })

    const comecou = row("u_rafael", { checkedInAt: "x", sessions: [{ taskId: "t1", title: "Roteiro", start: new Date().toISOString() }] })
    plans().setState({ items: [comecou] })
    expect(toast.mock.calls.at(-1)?.[1]).toMatchObject({ description: "Roteiro" })

    plans().setState({ items: [{ ...comecou, sessions: [{ ...comecou.sessions![0], end: "y" }], pauses: [{ reason: "almoco", start: new Date().toISOString() }] }] })
    expect(toast.mock.calls.at(-1)?.[1]).toMatchObject({ description: "Almoço" })

    const n = toast.mock.calls.length
    plans().setState({ items: [...plans().getState().items, row("u1", { checkedInAt: new Date().toISOString() })] })
    expect(toast).toHaveBeenCalledTimes(n)
  })
})
