import type { Metadata } from "next"
import { Inter } from "next/font/google"
import { AppShell } from "@/components/shell/app-shell"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import "./globals.css"

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Operacional",
  description: "Dashboard, pipeline, financeiro e tarefas da equipe em um só lugar.",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body className="antialiased">
        <TooltipProvider delayDuration={300}>
          <AppShell>{children}</AppShell>
          <Toaster position="bottom-right" theme="light" />
        </TooltipProvider>
      </body>
    </html>
  )
}
