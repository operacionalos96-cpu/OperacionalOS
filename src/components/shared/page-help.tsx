"use client"

import { useEffect, useState } from "react"
import { CircleHelpIcon } from "lucide-react"
import { GLOSSARY } from "@/config/glossary"
import type { PageInfo } from "@/config/pages"
import { METRICS } from "@/lib/domain/metrics"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"

const seenKey = (href: string) => `oos:ajuda-vista:${href}`

/**
 * "Como usar esta página": ajuda que a pessoa PUXA quando quer (não abre sozinha nem ocupa a tela).
 * Na primeira visita a cada página, um ponto laranja indica que ela existe; some depois do 1º clique.
 * Todo o texto vem de src/config/pages.ts, glossary.ts e metrics.ts — nada é escrito aqui.
 */
export function PageHelp({ page }: { page: PageInfo }) {
  const [open, setOpen] = useState(false)
  const [unseen, setUnseen] = useState(false)

  useEffect(() => {
    try {
      setUnseen(localStorage.getItem(seenKey(page.href)) !== "1")
    } catch {
      setUnseen(false)
    }
  }, [page.href])

  function show() {
    setOpen(true)
    setUnseen(false)
    try {
      localStorage.setItem(seenKey(page.href), "1")
    } catch {}
  }

  const words = [
    ...(page.metrics ?? []).map((id) => ({ term: METRICS[id].label, meaning: METRICS[id].help })),
    ...(page.terms ?? []).map((id) => GLOSSARY[id]),
  ]

  return (
    <>
      <button
        type="button"
        onClick={show}
        className="relative inline-flex h-10 items-center gap-1.5 rounded-full border bg-card px-3.5 text-sm font-medium text-muted-foreground shadow-card transition-colors hover:text-foreground"
      >
        <CircleHelpIcon className="size-4" />
        Como usar
        {unseen && <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-highlight ring-2 ring-background" aria-label="novidade" />}
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="text-xl">{page.title}</SheetTitle>
            <SheetDescription className="text-base">{page.purpose}</SheetDescription>
          </SheetHeader>
          <div className="grid gap-6 px-4 pb-8">
            <section>
              <h2 className="t-label mb-3">Como usar</h2>
              <ol className="grid gap-3">
                {page.howTo.map((step, i) => (
                  <li key={i} className="flex gap-3 text-[15px] leading-relaxed">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand">{i + 1}</span>
                    <span className="pt-0.5">{step}</span>
                  </li>
                ))}
              </ol>
            </section>
            {words.length > 0 && (
              <section>
                <h2 className="t-label mb-3">O que significa</h2>
                <dl className="grid gap-3">
                  {words.map((w) => (
                    <div key={w.term} className="rounded-xl border bg-card p-3">
                      <dt className="text-sm font-semibold">{w.term}</dt>
                      <dd className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{w.meaning}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
