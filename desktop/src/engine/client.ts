/**
 * Cliente do servidor do OperacionalOS para o motor: POST /api/workers/<ferramenta> com o token oos_ do PC.
 * 401 = a credencial do PC não vale mais (PC desligado por um founder ou pela pessoa): o motor para.
 */
export class StopError extends Error {
  constructor(message = "a credencial do PC não vale mais (PC desligado)") {
    super(message)
  }
}
export class ServerError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(`${status} ${code}`)
  }
}

export interface ServerClient {
  call<T = unknown>(tool: string, args?: Record<string, unknown>): Promise<T>
}

export function serverClient(opts: { baseUrl: string; token: string; timeoutMs?: number; fetchImpl?: typeof fetch }): ServerClient {
  const base = opts.baseUrl.replace(/\/+$/, "")
  const f = opts.fetchImpl ?? fetch
  if (!/^oos_[A-Za-z0-9_-]{30,}$/.test(opts.token)) throw new Error("token do PC inválido")
  return {
    async call<T>(tool: string, args: Record<string, unknown> = {}) {
      if (!/^[a-z_]{3,40}$/.test(tool)) throw new Error("ferramenta inválida")
      let res: Response
      try {
        res = await f(`${base}/api/workers/${tool}`, {
          method: "POST",
          headers: { authorization: `Bearer ${opts.token}`, "content-type": "application/json" },
          body: JSON.stringify(args),
          signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
        })
      } catch {
        throw new ServerError(0, "sem_conexao")
      }
      if (res.status === 401) throw new StopError()
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok) throw new ServerError(res.status, typeof body.erro === "string" ? body.erro.slice(0, 120) : "erro")
      return body as T
    },
  }
}
