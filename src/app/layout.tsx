import type { Metadata } from "next"
import { Plus_Jakarta_Sans, Source_Serif_4 } from "next/font/google"
import { ThemeProvider } from "next-themes"
import { AppShell } from "@/components/shell/app-shell"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import "./globals.css"

// Identidade HZK (guia "HZK Company projeto base"): Milliard nos títulos e Kefa III de apoio.
// O globals.css pede "Milliard" e "Kefa III" primeiro: no PC que tiver as fontes oficiais instaladas,
// são elas que aparecem. Sem elas, entram as mais próximas: Plus Jakarta Sans (geométrica, "a" de dois
// andares, como a Milliard) e Source Serif 4.
const sans = Plus_Jakarta_Sans({ variable: "--font-inter", subsets: ["latin"] })
const serif = Source_Serif_4({ variable: "--font-hzk-serif", subsets: ["latin"], style: ["normal", "italic"] })

export const metadata: Metadata = {
  title: "Operacional OS",
  description: "Dashboard, pipeline, financeiro e tarefas da equipe em um só lugar.",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${sans.variable} ${serif.variable}`} suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          <TooltipProvider delayDuration={300}>
            <AppShell>{children}</AppShell>
            <Toaster position="bottom-right" />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
