import type { Metadata } from "next"
import { Hanken_Grotesk } from "next/font/google"
import { ThemeProvider } from "next-themes"
import { AppShell } from "@/components/shell/app-shell"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import "./globals.css"

// Mesma variável (--font-inter) usada no globals.css; só a fonte mudou.
const sans = Hanken_Grotesk({ variable: "--font-inter", subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Operacional OS",
  description: "Dashboard, pipeline, financeiro e tarefas da equipe em um só lugar.",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={sans.variable} suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <TooltipProvider delayDuration={300}>
            <AppShell>{children}</AppShell>
            <Toaster position="bottom-right" />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
