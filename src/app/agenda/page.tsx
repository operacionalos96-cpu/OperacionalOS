"use client"

import { PageHeader } from "@/components/shared/layout"
import { CalendarView } from "@/components/hzk/calendar-view"

/** Agenda (ADR 0010): o calendário do time — reuniões, sessões, folgas e prazos, em Dia, Semana e Mês. */
export default function AgendaPage() {
  return (
    <div className="flex flex-col">
      <PageHeader page="/agenda" />
      <div className="page-body">
        <CalendarView />
      </div>
    </div>
  )
}
