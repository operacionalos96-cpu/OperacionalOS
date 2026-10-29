import { isIP } from "node:net"

/** Regras puras: o endereço IP pertence a uma rede que um webhook de saída nunca deve alcançar? */
export function forbiddenAddress(ip: string, allowLoopback = false): boolean {
  const addr = ip.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0]
  const kind = isIP(addr)
  if (kind === 4) return forbiddenV4(addr, allowLoopback)
  if (kind === 6) {
    const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return forbiddenV4(mapped[1], allowLoopback)
    const hexMapped = addr.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
    if (hexMapped) {
      const a = parseInt(hexMapped[1], 16), b = parseInt(hexMapped[2], 16)
      return forbiddenV4(`${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`, allowLoopback)
    }
    if (addr === "::1") return !allowLoopback
    if (addr === "::") return true
    const first = parseInt(addr.split(":")[0] || "0", 16)
    if ((first & 0xfe00) === 0xfc00) return true // fc00::/7 único-local
    if ((first & 0xffc0) === 0xfe80) return true // fe80::/10 link-local
    if ((first & 0xff00) === 0xff00) return true // multicast
    if (addr.startsWith("64:ff9b:")) return true // NAT64
    if (addr.startsWith("2001:db8")) return true // documentação
    return false
  }
  return true // não é IP válido
}

function forbiddenV4(ip: string, allowLoopback: boolean): boolean {
  const [a, b] = ip.split(".").map(Number)
  if (a === 127) return !allowLoopback
  if (a === 0 || a === 10) return true
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  if (a === 169 && b === 254) return true // link-local / metadados de nuvem
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 192 && b === 0) return true
  if (a === 198 && (b === 18 || b === 19)) return true
  if (a >= 224) return true // multicast e reservado
  return false
}
