import { fileURLToPath } from "node:url"
import { configDefaults, defineConfig } from "vitest/config"

// Faz os testes entenderem o atalho "@/…" (= src/…), igual ao Next.js.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // .claude/worktrees guarda cópias antigas do repositório: os testes delas não são os deste código.
  test: { environment: "node", exclude: [...configDefaults.exclude, ".claude/**"] },
})
