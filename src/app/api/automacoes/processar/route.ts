import { NextResponse } from "next/server"
import { requireMember } from "@/lib/server/auth"
import { runSystemJobs } from "@/lib/server/automations"
import { rateHit } from "@/lib/server/rate-limit"

/**
 * POST /api/automacoes/processar — executa agora as automações que estão na fila (ADR 0006).
 * O navegador chama logo depois de uma ação que dispara automação (ex.: lead ganho), para o
 * resultado aparecer em segundos. Sem esta chamada, o agendador (/api/runner/tick) faz o mesmo
 * em até 1 minuto. Não recebe parâmetros: só processa o que o BANCO enfileirou.
 */
export const maxDuration = 30
const noStore = { "Cache-Control": "no-store" }

export async function POST() {
  const member = await requireMember()
  if (!member) return NextResponse.json({ erro: "não autorizado" }, { status: 401, headers: noStore })
  if (!(await rateHit(`automacoes:min:${member.userId}`, 20, 60)))
    return NextResponse.json({ erro: "Muitas chamadas seguidas. Espere um minuto." }, { status: 429, headers: noStore })
  try {
    return NextResponse.json(await runSystemJobs(undefined, 5), { headers: noStore })
  } catch (e) {
    console.error("[automacoes] falha ao processar a fila", e)
    return NextResponse.json({ erro: "fila indisponível" }, { status: 503, headers: noStore })
  }
}
