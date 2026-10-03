import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

// Faz os testes entenderem o atalho "@/…" (= src/…), igual ao Next.js.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { environment: "node" },
})
