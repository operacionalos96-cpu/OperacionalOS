/**
 * Nível 1 do bot: ler e escrever SÓ nas pastas liberadas (notas 26 e 27; nota 42, ameaças 2 e 13).
 *
 * O motor confere o caminho de cada arquivo, sem confiar no que a IA diz:
 *  - recusa na entrada o que o Windows interpreta de jeito especial: \\?\, \\.\, UNC (\\servidor), "C:pasta"
 *    (relativo à unidade), fluxo alternativo (arquivo.txt:fluxo), nomes de dispositivo (CON, NUL, COM1…),
 *    nome terminado em ponto ou espaço, caractere de controle;
 *  - resolve ".." e confere que o resultado continua dentro de uma pasta liberada (por segmento, sem
 *    diferença de maiúscula no Windows: "Projetos-mal" não passa por "Projetos");
 *  - resolve o caminho REAL (atalhos simbólicos, junções e nomes curtos 8.3) do arquivo, ou do pai mais
 *    próximo que existe, e confere de novo contra o caminho real da pasta liberada;
 *  - depois de escrever, confere outra vez (alguém pode ter trocado uma pasta por um atalho no meio).
 * Apagar vai para a lixeira (quem chama injeta a lixeira do sistema). Uma pasta liberada nunca é apagada inteira.
 * Tudo vai para o registro local, que só a pessoa vê.
 * Sem dependência fora do Node: roda no motor do app e nos testes.
 */
import { promises as fsp, realpath as realpathCb } from "node:fs"
import nodePath from "node:path"
import { promisify } from "node:util"

// a versão "native" resolve junções e nomes curtos 8.3 pelo próprio Windows; só existe na API de callback
const realpathNative = promisify(realpathCb.native)

export class FolderError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

export interface FolderLogEntry {
  tool: string
  path: string
  ok: boolean
  code?: string
  bytes?: number
}

export interface FolderGuardOptions {
  /** Pastas que a pessoa liberou (confirmadas na janela do app). */
  roots: string[]
  /** Manda para a lixeira do sistema (Electron: shell.trashItem). Sem lixeira, apagar é recusado. */
  trash?: (absPath: string) => Promise<void>
  log?: (e: FolderLogEntry) => void
  /** Para testes; padrão = o sistema atual. */
  platform?: NodeJS.Platform
  maxReadBytes?: number
  maxWriteBytes?: number
}

const DEVICE = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³]|conin\$|conout\$|clock\$)(\..*)?$/i

export function createFolderGuard(opts: FolderGuardOptions) {
  const win = (opts.platform ?? process.platform) === "win32"
  const P = win ? nodePath.win32 : nodePath.posix
  const maxRead = opts.maxReadBytes ?? 512 * 1024
  const maxWrite = opts.maxWriteBytes ?? 2 * 1024 * 1024
  const roots = opts.roots.map((r) => P.resolve(r))
  const norm = (p: string) => (win ? p.toLowerCase() : p)
  const inside = (child: string, root: string) => {
    const c = norm(P.resolve(child))
    const r = norm(P.resolve(root))
    if (c === r) return true
    const rr = r.endsWith(P.sep) ? r : r + P.sep
    return c.startsWith(rr)
  }

  function lexicalCheck(input: unknown): string {
    if (typeof input !== "string" || !input.trim()) throw new FolderError("caminho_vazio", "caminho vazio")
    if (input.length > 1000) throw new FolderError("caminho_longo", "caminho longo demais")
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f]/.test(input)) throw new FolderError("caminho_invalido", "caminho com caractere de controle")
    if (win) {
      const s = input.replace(/\//g, "\\")
      if (/^\\\\/.test(s)) throw new FolderError("caminho_de_rede", "caminho de rede ou de dispositivo (\\\\…) não é aceito")
      if (/^[a-zA-Z]:(?![\\])/.test(s)) throw new FolderError("caminho_invalido", "caminho relativo à unidade (C:pasta) não é aceito")
      const afterDrive = /^[a-zA-Z]:\\/.test(s) ? s.slice(2) : s
      if (afterDrive.includes(":")) throw new FolderError("caminho_invalido", "fluxo alternativo (arquivo:fluxo) não é aceito")
      if (/[<>"|?*]/.test(afterDrive)) throw new FolderError("caminho_invalido", "caractere proibido no Windows")
      for (const seg of afterDrive.split("\\")) {
        if (!seg || seg === "." || seg === "..") continue
        if (DEVICE.test(seg)) throw new FolderError("caminho_invalido", `nome reservado do Windows: ${seg}`)
        if (/[. ]$/.test(seg)) throw new FolderError("caminho_invalido", "nome terminado em ponto ou espaço")
      }
    }
    const abs = P.isAbsolute(input) ? P.resolve(input) : roots.length ? P.resolve(roots[0], input) : ""
    if (!abs) throw new FolderError("sem_pasta", "nenhuma pasta liberada")
    return abs
  }

  async function realOf(abs: string): Promise<string> {
    // caminho real do próprio alvo, se existe; senão do pai mais próximo que existe + o resto
    let cur = abs
    const rest: string[] = []
    for (;;) {
      try {
        const real = await realpathNative(cur)
        return rest.length ? P.join(real, ...rest.reverse()) : real
      } catch (e) {
        const code = (e as NodeJS.ErrnoException).code
        if (code !== "ENOENT" && code !== "ENOTDIR") throw new FolderError("caminho_invalido", "não foi possível conferir o caminho")
        const parent = P.dirname(cur)
        if (parent === cur) throw new FolderError("caminho_invalido", "caminho sem raiz")
        rest.push(P.basename(cur))
        cur = parent
      }
    }
  }

  /** Confere o caminho e devolve o absoluto e a pasta liberada que o contém. Lança FolderError se sair. */
  async function resolve(input: unknown): Promise<{ abs: string; root: string }> {
    if (!roots.length) throw new FolderError("sem_pasta", "nenhuma pasta liberada")
    const abs = lexicalCheck(input)
    const root = roots.find((r) => inside(abs, r))
    if (!root) throw new FolderError("fora_da_pasta", "fora das pastas liberadas")
    const rootReal = await realpathNative(root).catch(() => null)
    if (!rootReal) throw new FolderError("pasta_sumiu", "a pasta liberada não existe mais")
    const real = await realOf(abs)
    if (!inside(real, rootReal)) throw new FolderError("fora_da_pasta", "o caminho leva para fora da pasta liberada (atalho ou junção)")
    return { abs, root }
  }

  const log = (e: FolderLogEntry) => {
    try {
      opts.log?.(e)
    } catch {
      /* registro nunca derruba a ação */
    }
  }
  async function guarded<T>(tool: string, path: unknown, fn: (abs: string, root: string) => Promise<T & { bytes?: number }>): Promise<T> {
    try {
      const { abs, root } = await resolve(path)
      const out = await fn(abs, root)
      log({ tool, path: abs, ok: true, bytes: out.bytes })
      return out
    } catch (e) {
      const code = e instanceof FolderError ? e.code : (e as NodeJS.ErrnoException).code === "ENOENT" ? "nao_existe" : "falhou"
      log({ tool, path: typeof path === "string" ? path.slice(0, 300) : "", ok: false, code })
      if (e instanceof FolderError) throw e
      throw new FolderError(code, code === "nao_existe" ? "não existe" : "a operação falhou")
    }
  }

  return {
    roots: () => [...roots],
    resolve,
    async list(path: unknown) {
      return guarded("listar", path, async (abs) => {
        const items = await fsp.readdir(abs, { withFileTypes: true })
        return {
          path: abs,
          items: items.slice(0, 500).map((d) => ({ name: d.name, type: d.isDirectory() ? "pasta" : d.isSymbolicLink() ? "atalho" : "arquivo" })),
          truncated: items.length > 500,
        }
      })
    },
    async read(path: unknown) {
      return guarded("ler", path, async (abs) => {
        const st = await fsp.stat(abs)
        if (!st.isFile()) throw new FolderError("nao_e_arquivo", "não é um arquivo")
        if (st.size > maxRead) throw new FolderError("grande_demais", `arquivo maior que ${maxRead} bytes`)
        const buf = await fsp.readFile(abs)
        if (buf.includes(0)) throw new FolderError("binario", "arquivo binário não é lido nesta versão")
        return { path: abs, content: buf.toString("utf8"), bytes: buf.length }
      })
    },
    async write(path: unknown, content: unknown) {
      if (typeof content !== "string") throw new FolderError("conteudo_invalido", "conteúdo deve ser texto")
      const bytes = Buffer.byteLength(content, "utf8")
      if (bytes > maxWrite) throw new FolderError("grande_demais", `conteúdo maior que ${maxWrite} bytes`)
      return guarded("escrever", path, async (abs, root) => {
        const st = await fsp.lstat(abs).catch(() => null)
        if (st?.isDirectory()) throw new FolderError("e_pasta", "o caminho é uma pasta")
        if (st?.isSymbolicLink()) throw new FolderError("fora_da_pasta", "não escrevo através de atalho")
        await fsp.mkdir(P.dirname(abs), { recursive: true })
        // o pai pode ter virado atalho entre a conferência e aqui
        const rootReal = await realpathNative(root)
        if (!inside(await realOf(abs), rootReal)) throw new FolderError("fora_da_pasta", "o caminho mudou durante a escrita")
        await fsp.writeFile(abs, content, "utf8")
        if (!inside(await realpathNative(abs), rootReal)) throw new FolderError("fora_da_pasta", "o caminho mudou durante a escrita")
        return { path: abs, bytes }
      })
    },
    async makeDir(path: unknown) {
      return guarded("criar_pasta", path, async (abs) => {
        await fsp.mkdir(abs, { recursive: true })
        return { path: abs }
      })
    },
    async trash(path: unknown) {
      return guarded("mover_para_lixeira", path, async (abs) => {
        if (roots.some((r) => norm(r) === norm(abs))) throw new FolderError("pasta_liberada", "a pasta liberada inteira não vai para a lixeira")
        if (!opts.trash) throw new FolderError("sem_lixeira", "lixeira indisponível; nada foi apagado")
        await fsp.lstat(abs)
        await opts.trash(abs)
        return { path: abs, trashed: true }
      })
    },
  }
}

export type FolderGuard = ReturnType<typeof createFolderGuard>
