import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/server/supabase-admin"
import { openSecret, type VaultSecret } from "@/lib/server/vault"
import { noStore, requireUnlocked } from "../shared"

/** POST: mostra o segredo de UM item (fica registrado quem viu e quando). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireUnlocked()
  if (gate.error) return gate.error
  const { id } = await params
  const db = supabaseAdmin()
  const { data, error } = await db.from("vault_items").select("secret").eq("id", id).maybeSingle()
  if (error || !data) return NextResponse.json({ erro: "Item não encontrado." }, { status: 404, headers: noStore })
  let secret: VaultSecret
  try {
    secret = openSecret(id, data.secret)
  } catch {
    return NextResponse.json({ erro: "Não foi possível abrir este item (chave diferente ou dado alterado)." }, { status: 500, headers: noStore })
  }
  await db.from("vault_items").update({ last_revealed_by: gate.member.teamId, last_revealed_at: new Date().toISOString() }).eq("id", id)
  return NextResponse.json({ secret }, { headers: noStore })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireUnlocked()
  if (gate.error) return gate.error
  const { id } = await params
  const { error } = await supabaseAdmin().from("vault_items").delete().eq("id", id)
  if (error) return NextResponse.json({ erro: "Não foi possível apagar." }, { status: 500, headers: noStore })
  return NextResponse.json({ ok: true }, { headers: noStore })
}
