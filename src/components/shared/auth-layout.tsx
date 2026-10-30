import { ShieldCheckIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Moldura das telas de acesso (login, nova senha).
 * Fundo no grafite azulado da HZK com as órbitas do manual da marca ("um universo digital"):
 * SVG estático com uma rotação muito lenta (desligada com "reduzir movimento").
 */
export function AuthLayout({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-[#1b2432] p-4 text-white">
      <Orbits />
      <div className={cn("relative w-full max-w-sm animate-enter", className)}>
        <div className="mb-7 flex flex-col items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- símbolo oficial em SVG */}
          <img src="/hzk-simbolo.svg" alt="" className="size-16 rounded-full shadow-[0_0_0_6px_rgb(255_255_255/6%),0_18px_40px_-12px_rgb(234_91_37/45%)]" />
          <p className="text-2xl tracking-tight">
            <span className="font-extrabold">HZK</span> <span className="font-light">Company</span>
          </p>
          <p className="text-sm text-white/60">Operacional OS</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-card p-6 text-card-foreground shadow-[0_30px_80px_-30px_rgb(0_0_0/70%)]">{children}</div>
        <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-white/55">
          <ShieldCheckIcon className="size-3.5" /> Conexão criptografada · acesso só para membros
        </p>
      </div>
    </div>
  )
}

/** Órbitas da identidade HZK: anéis finos com pontos laranja (Serviços, Produtos, Coprodução). */
function Orbits() {
  return (
    <svg aria-hidden className="pointer-events-none absolute top-1/2 left-1/2 size-[1100px] max-w-none -translate-x-1/2 -translate-y-1/2 opacity-60" viewBox="0 0 1100 1100">
      <g className="origin-center motion-safe:animate-[spin_160s_linear_infinite]" style={{ transformBox: "fill-box" }}>
        {[220, 330, 450].map((r) => (
          <circle key={r} cx="550" cy="550" r={r} fill="none" stroke="rgb(255 255 255 / 9%)" strokeWidth="1" />
        ))}
        <circle cx="550" cy="100" r="7" fill="#ea5b25" />
        <circle cx="880" cy="550" r="6" fill="#ea5b25" />
        <circle cx="390" cy="853" r="5" fill="#ea5b25" />
        <circle cx="330" cy="550" r="3" fill="rgb(255 255 255 / 45%)" />
      </g>
      <circle cx="550" cy="550" r="120" fill="url(#hzk-core)" />
      <defs>
        <radialGradient id="hzk-core">
          <stop offset="0%" stopColor="#ea5b25" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#ea5b25" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  )
}
