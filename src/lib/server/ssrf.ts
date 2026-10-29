import "server-only"
import { request as httpRequest } from "node:http"
import { request as httpsRequest } from "node:https"
import { lookup as dnsLookup } from "node:dns"
import { isIP } from "node:net"
import { forbiddenAddress } from "./ssrf-rules"

/**
 * Entrega HTTP para destinos externos (webhooks de saída) sem SSRF.
 * O endereço é validado NO MOMENTO DA CONEXÃO (lookup próprio), então um DNS que muda
 * entre o cadastro e o envio (DNS rebinding) não consegue chegar em rede interna.
 * Redirecionamentos não são seguidos. Corpo da resposta limitado.
 */
const allowLoopback = () => process.env.NODE_ENV !== "production"

type Lookup = (host: string, opts: { all?: boolean }, cb: (err: Error | null, address: string | { address: string; family: number }[], family?: number) => void) => void

const safeLookup: Lookup = (host, opts, cb) => {
  dnsLookup(host, { all: true, verbatim: true }, (err, addrs) => {
    if (err) return cb(err, "", 4)
    const bad = addrs.find((a) => forbiddenAddress(a.address, allowLoopback()))
    if (bad || addrs.length === 0) return cb(new Error("destino bloqueado (rede privada ou interna)"), "", 4)
    if (opts.all) return cb(null, addrs)
    cb(null, addrs[0].address, addrs[0].family)
  })
}

/** Validação antecipada (cadastro do webhook): resolve o nome e recusa destinos internos. */
export async function assertPublicHost(hostname: string): Promise<string | null> {
  const host = hostname.replace(/^\[|\]$/g, "")
  if (isIP(host)) return forbiddenAddress(host, allowLoopback()) ? "destino bloqueado (rede privada ou interna)" : null
  return new Promise((resolve) => {
    dnsLookup(host, { all: true, verbatim: true }, (err, addrs) => {
      if (err) return resolve("não foi possível resolver o endereço")
      resolve(addrs.some((a) => forbiddenAddress(a.address, allowLoopback())) ? "destino bloqueado (rede privada ou interna)" : null)
    })
  })
}

export function safePost(url: string, headers: Record<string, string>, body: string, timeoutMs: number) {
  return new Promise<{ status: number; text: string }>((resolve, reject) => {
    const u = new URL(url)
    const req = (u.protocol === "https:" ? httpsRequest : httpRequest)(
      u,
      { method: "POST", headers: { ...headers, "content-length": String(Buffer.byteLength(body)) }, lookup: safeLookup as never, timeout: timeoutMs },
      (res) => {
        const chunks: Buffer[] = []
        let size = 0
        res.on("data", (c: Buffer) => { if (size < 2048) { chunks.push(c); size += c.length } })
        res.on("end", () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString("utf8").slice(0, 500) }))
        res.on("error", reject)
      },
    )
    req.on("timeout", () => req.destroy(Object.assign(new Error("tempo esgotado"), { name: "TimeoutError" })))
    req.on("error", reject)
    req.end(body)
  })
}
