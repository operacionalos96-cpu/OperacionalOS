import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/server/supabase-admin"
import { cleanItem, sealSecret } from "@/lib/server/vault"
import { noStore, requireUnlocked } from "./shared"

/** GET: lista do cofre (só nome, site e histórico — nenhum segredo). */
export async function GET() {
  const gate = await requireUnlocked()
  if (gate.error) return gate.error
  const { data, error } = await supabaseAdmin()
    .from("vault_items")
    .select("id, name, url, created_by, updated_by, updated_at, last_revealed_by, last_revealed_at")
    .order("name")
  if (error) return NextResponse.json({ erro: "Não foi possível abrir o cofre. Rodou o SQL 0008?" }, { status: 500, headers: noStore })
  return NextResponse.json({ itens: data, segundos: gate.remaining }, { headers: noStore })
}

/** POST: cria ou atualiza um item. O segredo é criptografado antes de sair daqui. */
export async function POST(req: Request) {
  const gate = await requireUnlocked()
  if (gate.error) return gate.error
  const item = cleanItem(await req.json().catch(() => null))
  if (!item) return NextResponse.json({ erro: "Dê um nome ao item." }, { status: 400, headers: noStore })
  const id = item.id ?? randomUUID()
  const row = { id, name: item.name, url: item.url ?? null, secret: sealSecret(id, item.secret), updated_by: gate.member.teamId, updated_at: new Date().toISOString() }
  const db = supabaseAdmin()
  const { error } = item.id ? await db.from("vault_items").update(row).eq("id", id) : await db.from("vault_items").insert({ ...row, created_by: gate.member.teamId })
  if (error) return NextResponse.json({ erro: "Não foi possível salvar." }, { status: 500, headers: noStore })
  return NextResponse.json({ ok: true, id }, { headers: noStore })
}
