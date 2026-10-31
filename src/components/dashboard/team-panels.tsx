"use client"

import { useMemo } from "react"
import { useRouter } from "next/navigation"
import { ActivityIcon } from "lucide-react"
import { getUser } from "@/config/team"
import { teamFeed } from "@/lib/domain/insights"
import { openEntity } from "@/lib/entities/registry"
import { money, relative } from "@/lib/format"
import { useStore } from "@/lib/store"
import { Panel } from "@/components/shared/layout"
import { AvatarDot } from "@/components/shared/user-avatar"

/** O que a equipe fez por último: conversas, tarefas feitas, vendas e lançamentos. */
export function TeamFeedPanel({ className }: { className?: string }) {
  const { activities, tasks, leads, transactions } = useStore()
  const router = useRouter()
  const feed = useMemo(() => teamFeed({ activities, tasks, leads, transactions }, money, 8), [activities, tasks, leads, transactions])
  return (
    <Panel
      className={className}
      title={
        <span className="flex items-center gap-2">
          <ActivityIcon className="size-4 text-muted-foreground" /> Movimento da equipe
        </span>
      }
    >
      {feed.length === 0 ? (
        <p className="t-desc p-4 text-sm">Nada ainda. Conversas, vendas e tarefas feitas aparecem aqui.</p>
      ) : (
        <ul className="grid p-2">
          {feed.map((f, i) => (
            <li key={i}>
              <button
                onClick={() => f.ref && openEntity(f.ref, (href) => router.push(href))}
                className="flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-accent/50"
              >
                {f.who ? <AvatarDot userId={f.who} size="xs" className="mt-0.5" /> : <span className="size-4" />}
                <span className="min-w-0 flex-1 text-sm">
                  <span className="font-medium">{f.who ? getUser(f.who).name : ""}</span> <span className="text-muted-foreground">{f.text}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{relative(f.at)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
