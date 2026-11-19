"use client"

import { Conversations } from "@/components/dock/conversations"
import { useDock } from "@/lib/dock/store"

export default function DockPage() {
  const data = useDock((s) => s.data)
  return data ? <Conversations d={data} /> : null
}
