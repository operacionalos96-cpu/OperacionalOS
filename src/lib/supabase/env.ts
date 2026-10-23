/**
 * Variáveis públicas do Supabase (ficam no navegador por design).
 * A chave "publishable" só dá o acesso que as regras RLS do banco permitem —
 * por isso toda a segurança real está em supabase/migrations/*.sql.
 * NUNCA coloque a chave "secret"/"service_role" em variável NEXT_PUBLIC_.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ""

/** Demonstração local (só desenvolvimento): ver lib/supabase/sandbox.ts. */
export const SANDBOX = process.env.NEXT_PUBLIC_SANDBOX === "1" && process.env.NODE_ENV !== "production"

export const supabaseConfigured = SANDBOX || (SUPABASE_URL.startsWith("https://") && SUPABASE_KEY.length > 20)
