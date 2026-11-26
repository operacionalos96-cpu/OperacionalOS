import { NextResponse } from "next/server"
import { requireMember } from "@/lib/server/auth"
import { runDockCloud } from "@/lib/server/dock-cloud"
import { rateHit } from "@/lib/server/rate-limit"

/**
 * Motor do Dock na nuvem, AGORA, só para quem chamou (ADR 0026). A tela chama logo depois de mandar
 * mensagem, para a resposta não esperar o agendador (que passa a cada minuto e continua de reserva).
 * Só roda o trabalhador "nuvem" da própria pessoa: não há como pedir pelas conversas de outra.
 * Nada vem no corpo; o que responder sai da fila dela.
 */
export const maxDuration = 300 // teto do plano Hobby (https://vercel.com/docs/limits)
const noStore = { "Cache-Control": "no-store" }

export async function POST() {
  const member = await requireMember()
  if (!member) return NextResponse.json({ erro: "não autorizado" }, { status: 401, headers: noStore })
  // cada chamada pode gastar a cota do OpenRouter da empresa: no máximo 20 por minuto por pessoa
  if (!(await rateHit(`dock-nuvem:${member.userId}`, 20, 60))) return NextResponse.json({ erro: "muitas chamadas" }, { status: 429, headers: noStore })
  const r = await runDockCloud({ budgetMs: 60_000, ownerTeamId: member.teamId }).catch((e) => ({ workers: 0, erro: e instanceof Error ? e.message.slice(0, 120) : "falha" }))
  return NextResponse.json(r, { headers: noStore })
}
