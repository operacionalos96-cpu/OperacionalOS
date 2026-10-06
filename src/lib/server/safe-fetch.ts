import "server-only"
import { lookup } from "node:dns/promises"
import { isIP } from "node:net"

/**
 * Baixa uma página pública da internet sem virar porta para a rede interna (SSRF):
 * só http/https, portas padrão, nenhum IP privado/local (checado a cada redirecionamento),
 * tempo e tamanho limitados.
 */
export class FetchBlocked extends Error {}

export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip)
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number)
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224
  }
  if (v === 6) {
    const x = ip.toLowerCase()
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(x)
    if (mapped) return isPrivateIp(mapped[1])
    return x === "::" || x === "::1" || /^f[cd]/.test(x) || /^fe[89ab]/.test(x) || /^ff/.test(x)
  }
  return true
}

async function assertPublic(url: URL) {
  if (!/^https?:$/.test(url.protocol)) throw new FetchBlocked("só http/https")
  if (url.port && !["80", "443"].includes(url.port)) throw new FetchBlocked("porta não permitida")
  if (url.username || url.password) throw new FetchBlocked("url com credenciais")
  const host = url.hostname.replace(/^\[|\]$/g, "")
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(host)) throw new FetchBlocked("host local")
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => [])
  if (!addrs.length) throw new FetchBlocked("site não encontrado (DNS)")
  if (addrs.some((a) => isPrivateIp(a.address))) throw new FetchBlocked("endereço interno bloqueado")
}

export async function fetchPublicHtml(raw: string, { timeoutMs = 9000, maxBytes = 1_500_000 } = {}): Promise<{ url: string; html: string }> {
  let url = new URL(raw)
  const deadline = AbortSignal.timeout(timeoutMs)
  for (let hop = 0; hop < 5; hop++) {
    await assertPublic(url)
    const res = await fetch(url, {
      redirect: "manual",
      signal: deadline,
      headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36", accept: "text/html,application/xhtml+xml", "accept-language": "pt-BR,pt;q=0.9" },
    })
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url)
      continue
    }
    if (!res.ok) throw new FetchBlocked(`site respondeu ${res.status}`)
    const type = res.headers.get("content-type") ?? ""
    if (type && !/html|xml|text\/plain/i.test(type)) throw new FetchBlocked("não é uma página")
    // Lê até o limite e para.
    const reader = res.body?.getReader()
    if (!reader) return { url: url.href, html: "" }
    const chunks: Uint8Array[] = []
    let size = 0
    while (size < maxBytes) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      size += value.length
    }
    await reader.cancel().catch(() => {})
    const buf = Buffer.concat(chunks).subarray(0, maxBytes)
    const charset = /charset=([\w-]+)/i.exec(type)?.[1] ?? /<meta[^>]+charset=["']?([\w-]+)/i.exec(buf.subarray(0, 4000).toString("latin1"))?.[1] ?? "utf-8"
    let html: string
    try {
      html = new TextDecoder(charset.toLowerCase()).decode(buf)
    } catch {
      html = new TextDecoder("utf-8").decode(buf)
    }
    return { url: url.href, html }
  }
  throw new FetchBlocked("redirecionamentos demais")
}
