import { describe, expect, it } from "vitest"
import nextConfig from "../../next.config"

const directive = async (name: string) => {
  const [{ headers }] = await nextConfig.headers!()
  const csp = headers.find((h) => h.key === "Content-Security-Policy")?.value ?? ""
  return csp.split("; ").find((d) => d.startsWith(`${name} `))
}

describe("Content-Security-Policy (ADR 0016)", () => {
  // `realtime: { worker: true }` em src/lib/supabase/client.ts cria o Worker a partir de um blob.
  // Bloqueado, o Supabase fecha a conexão de vez: sem online, sem avisos e sem tempo real.
  it("libera o Worker do tempo real", async () => {
    expect(await directive("worker-src")).toContain("blob:")
  })

  it("não libera blob para scripts da página", async () => {
    expect(await directive("script-src")).not.toContain("blob:")
  })
})
