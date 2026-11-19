/**
 * Checagem de caminho do nível 1 no disco de verdade (pasta temporária), com casos maliciosos:
 * "..", absoluto fora, rede, dispositivo, fluxo alternativo, nomes reservados, pasta vizinha com o mesmo
 * começo, junção e atalho simbólico apontando para fora.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createFolderGuard, type FolderLogEntry } from "./folders"

const win = process.platform === "win32"
let base: string, root: string, outside: string, sibling: string
let canFileSymlink = false
const logs: FolderLogEntry[] = []
const trashed: string[] = []
let guard: ReturnType<typeof createFolderGuard>

const code = async (p: Promise<unknown>) => {
  try {
    await p
    return "ok"
  } catch (e) {
    return (e as { code?: string }).code ?? String(e)
  }
}

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), "hzk-pastas-"))
  root = join(base, "Projetos")
  outside = join(base, "segredos")
  sibling = join(base, "Projetos-mal")
  for (const d of [root, outside, sibling, join(root, "site")]) mkdirSync(d, { recursive: true })
  writeFileSync(join(root, "site", "index.html"), "<h1>oi</h1>")
  writeFileSync(join(outside, "senha.txt"), "nao-pode")
  writeFileSync(join(sibling, "x.txt"), "vizinha")
  // junção: no Windows funciona sem administrador
  symlinkSync(outside, join(root, "atalho-pasta"), "junction")
  try {
    symlinkSync(join(outside, "senha.txt"), join(root, "atalho-arquivo.txt"), "file")
    canFileSymlink = true
  } catch {
    canFileSymlink = false
  }
  guard = createFolderGuard({ roots: [root], log: (e) => logs.push(e), trash: async (p) => void trashed.push(p) })
})
afterAll(() => rmSync(base, { recursive: true, force: true }))

describe("dentro da pasta liberada", () => {
  it("lê, lista, escreve (criando subpastas) e manda para a lixeira", async () => {
    expect((await guard.read(join(root, "site", "index.html"))).content).toBe("<h1>oi</h1>")
    expect((await guard.read("site/index.html")).content).toBe("<h1>oi</h1>") // relativo à primeira pasta
    expect((await guard.list(root)).items.map((i) => i.name).sort()).toContain("site")
    await guard.write(join(root, "novo", "fundo", "a.md"), "# a")
    expect(readFileSync(join(root, "novo", "fundo", "a.md"), "utf8")).toBe("# a")
    await guard.trash(join(root, "novo", "fundo", "a.md"))
    expect(trashed).toEqual([join(root, "novo", "fundo", "a.md")])
    // a lixeira é do sistema: o motor não apaga nada sozinho
    expect(existsSync(join(root, "novo", "fundo", "a.md"))).toBe(true)
  })

  it("'..' que volta para dentro é aceito", async () => {
    expect((await guard.read(join(root, "site", "..", "site", "index.html"))).content).toBe("<h1>oi</h1>")
  })

  it("a pasta liberada inteira não vai para a lixeira; sem lixeira, nada é apagado", async () => {
    expect(await code(guard.trash(root))).toBe("pasta_liberada")
    const semLixeira = createFolderGuard({ roots: [root] })
    expect(await code(semLixeira.trash(join(root, "site", "index.html")))).toBe("sem_lixeira")
  })
})

describe("casos maliciosos: tudo recusado", () => {
  const cases: [string, () => string, string][] = [
    ["'..' saindo da pasta", () => join(root, "..", "segredos", "senha.txt"), "fora_da_pasta"],
    ["'..' relativo", () => "../segredos/senha.txt", "fora_da_pasta"],
    ["muitos '..'", () => "site/../../../../../../Windows/win.ini", "fora_da_pasta"],
    ["absoluto fora", () => join(outside, "senha.txt"), "fora_da_pasta"],
    ["pasta vizinha com o mesmo começo", () => join(sibling, "x.txt"), "fora_da_pasta"],
    ["vazio", () => "", "caminho_vazio"],
    ["caractere nulo", () => join(root, "a\u0000.txt"), "caminho_invalido"],
  ]
  if (win)
    cases.push(
      ["Windows do sistema", () => "C:\\Windows\\win.ini", "fora_da_pasta"],
      ["rede (UNC)", () => "\\\\servidor\\compartilhado\\a.txt", "caminho_de_rede"],
      ["rede com barras normais", () => "//servidor/compartilhado/a.txt", "caminho_de_rede"],
      ["prefixo \\\\?\\", () => `\\\\?\\${join(root, "site", "index.html")}`, "caminho_de_rede"],
      ["dispositivo \\\\.\\", () => "\\\\.\\PhysicalDrive0", "caminho_de_rede"],
      ["relativo à unidade", () => "C:segredos\\senha.txt", "caminho_invalido"],
      ["fluxo alternativo", () => join(root, "site", "index.html:escondido"), "caminho_invalido"],
      ["nome reservado CON", () => join(root, "CON"), "caminho_invalido"],
      ["nome reservado nul.txt", () => join(root, "nul.txt"), "caminho_invalido"],
      ["nome reservado COM1", () => join(root, "site", "com1.log"), "caminho_invalido"],
      ["termina em ponto", () => join(root, "site", "index.html."), "caminho_invalido"],
      ["termina em espaço", () => join(root, "site ", "index.html"), "caminho_invalido"],
      ["maiúsculas diferentes fora", () => join(base.toUpperCase(), "SEGREDOS", "senha.txt"), "fora_da_pasta"],
    )
  for (const [nome, p, esperado] of cases)
    it(nome, async () => {
      expect(await code(guard.read(p()))).toBe(esperado)
      expect(await code(guard.write(p(), "x"))).toBe(esperado)
      expect(await code(guard.trash(p()))).toBe(esperado)
    })

  it("junção dentro da pasta apontando para fora: não lê, não lista, não escreve (nem arquivo novo)", async () => {
    expect(await code(guard.read(join(root, "atalho-pasta", "senha.txt")))).toBe("fora_da_pasta")
    expect(await code(guard.list(join(root, "atalho-pasta")))).toBe("fora_da_pasta")
    expect(await code(guard.write(join(root, "atalho-pasta", "novo.txt"), "vazou"))).toBe("fora_da_pasta")
    expect(await code(guard.write(join(root, "atalho-pasta", "sub", "novo.txt"), "vazou"))).toBe("fora_da_pasta")
    expect(existsSync(join(outside, "novo.txt"))).toBe(false)
    expect(existsSync(join(outside, "sub"))).toBe(false)
  })

  it("atalho simbólico de arquivo apontando para fora: não lê nem escreve", async (ctx) => {
    if (!canFileSymlink) ctx.skip() // o Windows sem modo de desenvolvedor não deixa criar; a junção acima cobre o caso
    expect(await code(guard.read(join(root, "atalho-arquivo.txt")))).toBe("fora_da_pasta")
    expect(await code(guard.write(join(root, "atalho-arquivo.txt"), "sobrescreveu"))).toBe("fora_da_pasta")
    expect(readFileSync(join(outside, "senha.txt"), "utf8")).toBe("nao-pode")
  })

  it("nada saiu da pasta: o arquivo de fora continua intacto e nada foi para a lixeira por engano", async () => {
    expect(readFileSync(join(outside, "senha.txt"), "utf8")).toBe("nao-pode")
    expect(trashed.every((t) => t.toLowerCase().startsWith(root.toLowerCase()))).toBe(true)
  })

  it("sem pasta liberada, tudo é recusado", async () => {
    const vazio = createFolderGuard({ roots: [] })
    expect(await code(vazio.read(join(root, "site", "index.html")))).toBe("sem_pasta")
  })

  it("limites: arquivo grande e binário", async () => {
    const pequeno = createFolderGuard({ roots: [root], maxReadBytes: 5, maxWriteBytes: 5 })
    expect(await code(pequeno.read(join(root, "site", "index.html")))).toBe("grande_demais")
    expect(await code(pequeno.write(join(root, "b.txt"), "123456"))).toBe("grande_demais")
    writeFileSync(join(root, "bin.dat"), Buffer.from([1, 0, 2]))
    expect(await code(guard.read(join(root, "bin.dat")))).toBe("binario")
  })

  it("tudo fica no registro local, inclusive as recusas", () => {
    expect(logs.some((l) => l.ok && l.tool === "escrever")).toBe(true)
    expect(logs.some((l) => !l.ok && l.code === "fora_da_pasta")).toBe(true)
  })
})
