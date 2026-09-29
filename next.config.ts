import type { NextConfig } from "next"

const isDev = process.env.NODE_ENV !== "production"
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
const supabaseWs = supabase.replace(/^https:/, "wss:")

/**
 * Content-Security-Policy: o navegador só executa/conecta no que está listado.
 * Reduz muito o estrago de uma injeção de script (XSS) e impede que o app seja
 * colocado dentro de outro site (clickjacking).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabase} ${supabaseWs}${isDev ? " ws://localhost:* http://localhost:*" : ""}`.trim(),
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ")

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]),
]

const nextConfig: NextConfig = {
  // O indicador de dev cobre a navegação inferior no celular.
  devIndicators: false,
  // Não anuncia a tecnologia do servidor.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }]
  },
}

export default nextConfig
