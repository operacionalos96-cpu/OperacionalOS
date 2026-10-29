import { describe, expect, it } from "vitest"
import { forbiddenAddress } from "./ssrf-rules"

describe("proteção SSRF dos webhooks de saída", () => {
  it.each(["10.0.0.5", "172.16.1.1", "172.31.255.1", "192.168.0.10", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "fe80::1", "fd00::1", "::ffff:10.0.0.1", "::ffff:a9fe:a9fe", "127.0.0.1", "nao-e-ip"])("bloqueia %s", (ip) => {
    expect(forbiddenAddress(ip, false)).toBe(true)
  })
  it.each(["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"])("permite %s", (ip) => {
    expect(forbiddenAddress(ip, false)).toBe(false)
  })
  it("loopback só passa fora de produção", () => {
    expect(forbiddenAddress("127.0.0.1", true)).toBe(false)
    expect(forbiddenAddress("::1", true)).toBe(false)
    expect(forbiddenAddress("10.0.0.1", true)).toBe(true)
  })
})
