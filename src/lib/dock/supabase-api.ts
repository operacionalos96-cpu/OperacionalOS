"use client"

import type { SupabaseClient } from "@supabase/supabase-js"
import type { DockData } from "@/lib/domain/dock"
import type { OfficeStateV1 } from "@/lib/domain/office"
import type { DockApi } from "./api"

/* eslint-disable @typescript-eslint/no-explicit-any -- linhas do banco chegam sem tipo; o mapa abaixo dá a forma */
type Row = Record<string, any>

async function rows(q: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<Row[]> {
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as Row[]
}

/** O app de verdade: lê pela RLS da 0027 e escreve só pelas funções. */
export function supabaseDockApi(db: SupabaseClient): DockApi {
  const rpc = async <T = unknown>(fn: string, args: Record<string, unknown>) => {
    const { data, error } = await db.rpc(fn, args)
    if (error) throw new Error(error.message)
    return data as T
  }

  return {
    mode: "supabase",

    async load() {
      const [office, agents, conns, threads, messages, tm, skills, versions, inst, props, connectors, actions, ac, grants, approvals, requests, kits, routines, usage, policies] = await Promise.all([
        rows(db.from("office").select("consent_at, suspended_at")),
        rows(db.from("office_agents").select("*").order("created_at")),
        rows(db.from("office_connections").select("id, kind, provider, label, status, models, quota_resets_at, endpoint").order("created_at")),
        rows(db.from("office_threads").select("*").order("created_at")),
        rows(db.from("office_messages").select("id, thread_id, author_type, author_id, kind, body, report, provider, model, connection_id, fallback_from, fallback_reason, created_at").order("created_at", { ascending: false }).limit(800)),
        rows(db.from("office_thread_models").select("thread_id, agent_id, connection_id, model")),
        rows(db.from("dock_skills").select("id, scope, area_id, name, description, in_kit, current_version, archived, created_by").order("name")),
        rows(db.from("dock_skill_versions").select("skill_id, version, label, what_changed, min_level, required_connectors, has_scripts, examples, published_at, approved_by")),
        rows(db.from("office_agent_skills").select("agent_id, skill_id, pinned_version, seen_version")),
        rows(db.from("dock_skill_proposals").select("id, area_id, skill_id, name, label, what_changed, why, base_version, min_level, signal_count, status, proposed_by, proposed_at").order("proposed_at", { ascending: false })),
        rows(db.from("dock_connectors").select("id, name, category, description, note, runs_at, min_level, wave, status, source_url, approved_by, approved_at").order("name")),
        rows(db.from("dock_connector_actions").select("connector_id, action_key, label, action_class, max_items, sends_outside, money, enabled")),
        rows(db.from("office_agent_connectors").select("agent_id, connector_id, read_only, status")),
        rows(db.from("office_action_grants").select("agent_id, connector_id, action_key, expires_at")),
        rows(db.from("office_approvals").select("*").order("created_at", { ascending: false }).limit(200)),
        rows(db.from("dock_connector_requests").select("id, name, url, why, requested_by, requested_at, status").order("requested_at", { ascending: false })),
        rows(db.from("dock_kit_bots").select("id, area_id, name, title, suggested_level, skill_ids, avatar_color, avatar_glyph").eq("active", true).order("position")),
        rows(db.from("office_routines").select("*").order("created_at")),
        rows(db.from("office_usage").select("agent_id, connection_id, provider, model, free, cost_usd, fallback_from, created_at").gte("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString())),
        rows(db.from("dock_provider_policies").select("provider, data_class")),
      ])
      let state: OfficeStateV1 | null = null
      try {
        const r = await fetch("/api/escritorio/estado", { cache: "no-store" })
        if (r.ok) state = (await r.json()) as OfficeStateV1
      } catch {
        // sem estado: os bots aparecem como livres
      }
      const data: DockData = {
        consent: !!office[0]?.consent_at,
        suspended: !!office[0]?.suspended_at,
        agents: agents.map((a) => ({
          id: a.id, name: a.name, title: a.title, description: a.description ?? "", instructions: a.instructions ?? "",
          parentAgentId: a.parent_agent_id, connectionId: a.connection_id, model: a.model,
          backupModels: (a.backup_models ?? []).map((b: Row) => ({ connectionId: b.connection_id, model: b.model })),
          capabilities: a.capabilities ?? ["texto"], effort: a.effort ?? "medium", paused: !!a.paused, canCreateAgents: !!a.can_create_agents,
          accessLevel: a.access_level ?? 0, avatarStyle: a.avatar_style ?? "constelacao", avatarColor: a.avatar_color ?? "grafite",
          avatarGlyph: a.avatar_glyph ?? "", origin: a.origin ?? "do_zero", pcPending: a.pc_pending ?? null,
        })),
        connections: conns.map((c) => ({ id: c.id, kind: c.kind, provider: c.provider, label: c.label, status: c.status, models: c.models ?? [], quotaResetsAt: c.quota_resets_at, endpoint: c.endpoint })),
        threads: threads.map((t) => ({ id: t.id, kind: t.kind, title: t.title, agentIds: t.agent_ids, leadAgentId: t.lead_agent_id, archived: t.archived, continuedFromThreadId: t.continued_from_thread_id ?? null, createdAt: t.created_at })),
        messages: messages.reverse().map((m) => ({
          id: m.id, threadId: m.thread_id, authorType: m.author_type, authorId: m.author_id, kind: m.kind, body: m.body,
          report: m.report ? { result: m.report.result, evidence: m.report.evidence, unblock: m.report.unblock, status: m.report.status } : null,
          provider: m.provider, model: m.model, connectionId: m.connection_id, fallbackFrom: m.fallback_from, fallbackReason: m.fallback_reason, createdAt: m.created_at,
        })),
        threadModels: tm.map((t) => ({ threadId: t.thread_id, agentId: t.agent_id, connectionId: t.connection_id, model: t.model })),
        skills: skills.map((s) => ({ id: s.id, scope: s.scope, areaId: s.area_id, name: s.name, description: s.description, inKit: s.in_kit, currentVersion: s.current_version, archived: s.archived, createdBy: s.created_by })),
        versions: versions.map((v) => ({ skillId: v.skill_id, version: v.version, label: v.label, whatChanged: v.what_changed, minLevel: v.min_level, requiredConnectors: v.required_connectors ?? [], hasScripts: v.has_scripts, examples: v.examples ?? [], publishedAt: v.published_at, approvedBy: v.approved_by })),
        agentSkills: inst.map((i) => ({ agentId: i.agent_id, skillId: i.skill_id, pinnedVersion: i.pinned_version, seenVersion: i.seen_version })),
        proposals: props.map((p) => ({ id: p.id, areaId: p.area_id, skillId: p.skill_id, name: p.name, label: p.label, whatChanged: p.what_changed, why: p.why, baseVersion: p.base_version, minLevel: p.min_level, signalCount: p.signal_count, status: p.status, proposedBy: p.proposed_by, proposedAt: p.proposed_at })),
        connectors: connectors.map((c) => ({ id: c.id, name: c.name, category: c.category, description: c.description, note: c.note, runsAt: c.runs_at, minLevel: c.min_level, wave: c.wave, status: c.status, sourceUrl: c.source_url, approvedBy: c.approved_by, approvedAt: c.approved_at })),
        actions: actions.map((x) => ({ connectorId: x.connector_id, actionKey: x.action_key, label: x.label, actionClass: x.action_class, maxItems: x.max_items, sendsOutside: x.sends_outside, money: x.money, enabled: x.enabled })),
        agentConnectors: ac.map((i) => ({ agentId: i.agent_id, connectorId: i.connector_id, readOnly: i.read_only, status: i.status })),
        grants: grants.map((g) => ({ agentId: g.agent_id, connectorId: g.connector_id, actionKey: g.action_key, expiresAt: g.expires_at })),
        approvals: approvals.map((a) => ({
          id: a.id, agentId: a.agent_id, threadId: a.thread_id, connectorId: a.connector_id, actionKey: a.action_key, actionClass: a.action_class, gate: a.gate,
          approver: a.approver, origin: a.origin, originDetail: a.origin_detail, actionLabel: a.action_label ?? "", ownerOkAt: a.owner_ok_at ?? null, founderOkAt: a.founder_ok_at ?? null, title: a.title, summary: a.summary, draft: a.draft ?? {}, itemCount: a.item_count,
          status: a.status, createdAt: a.created_at, expiresAt: a.expires_at, decidedAt: a.decided_at, resultSummary: a.result_summary,
        })),
        requests: requests.map((r) => ({ id: r.id, name: r.name, url: r.url, why: r.why, requestedBy: r.requested_by, requestedAt: r.requested_at, status: r.status })),
        kitBots: kits.map((k) => ({ id: k.id, areaId: k.area_id, name: k.name, title: k.title, suggestedLevel: k.suggested_level, skillIds: k.skill_ids ?? [], avatarColor: k.avatar_color, avatarGlyph: k.avatar_glyph })),
        routines: routines.map((r) => ({ id: r.id, agentId: r.agent_id, title: r.title, prompt: r.prompt, kind: r.kind, timeLocal: String(r.time_local).slice(0, 5), weekday: r.weekday, monthday: r.monthday, enabled: r.enabled, nextRunAt: r.next_run_at, lastRunAt: r.last_run_at })),
        usage: usage.map((u) => ({ agentId: u.agent_id, connectionId: u.connection_id, provider: u.provider, model: u.model, free: u.free, costUsd: u.cost_usd === null ? null : Number(u.cost_usd), fallbackFrom: u.fallback_from, createdAt: u.created_at })),
        policies: policies.map((p) => ({ provider: p.provider, dataClass: p.data_class })),
        bridge: { online: !!state?.bridge.online, lastSeenAt: state?.bridge.last_seen_at ?? null, name: null },
        states: Object.fromEntries((state?.agents ?? []).map((a) => [a.id, a.state])),
      }
      return data
    },

    subscribe(onChange) {
      let t: ReturnType<typeof setTimeout> | undefined
      const kick = () => {
        clearTimeout(t)
        t = setTimeout(onChange, 250)
      }
      const ch = db.channel("dock")
      for (const table of ["office_messages", "office_agents", "office_approvals", "office_connections", "office_threads", "office_agent_skills", "office_agent_connectors", "office_routines", "dock_skills", "dock_connectors", "dock_connector_requests", "dock_skill_proposals"])
        ch.on("postgres_changes", { event: "*", schema: "public", table }, kick)
      ch.subscribe()
      // estado dos bots (fila) muda sem linha nova nessas tabelas: confere a cada 20 s
      const poll = setInterval(onChange, 20_000)
      return () => {
        clearTimeout(t)
        clearInterval(poll)
        void db.removeChannel(ch)
      }
    },

    acceptConsent: () => rpc("office_accept_consent", { p_version: "dock-v3" }),
    createAgent: (a) => rpc("office_upsert_agent", { p_id: null, p_parent: null, p_name: a.name, p_title: a.title, p_instructions: a.instructions, p_model: a.model, p_connection_id: a.connectionId, p_can_create_agents: !!a.canCreateAgents }),
    createAgentFromKit: (k, name) => rpc("office_create_agent_from_kit", { p_kit_bot: k, p_name: name ?? null }),
    updateAgent: async (id, a) => {
      await rpc("office_upsert_agent", {
        p_id: id, p_parent: a.parentAgentId ?? null, p_name: a.name, p_title: a.title, p_description: a.description ?? "", p_instructions: a.instructions,
        p_model: a.model, p_effort: a.effort ?? "medium", p_connection_id: a.connectionId,
        p_backup_models: a.backupModels.map((b) => ({ connection_id: b.connectionId, model: b.model })),
        p_capabilities: a.capabilities ?? ["texto"], p_can_create_agents: !!a.canCreateAgents,
      })
    },
    setAccess: (id, level) => rpc("office_set_agent_access", { p_agent: id, p_level: level }),
    setAvatar: (id, style, color, glyph) => rpc("office_set_agent_avatar", { p_agent: id, p_style: style, p_color: color, p_glyph: glyph }),
    setPaused: (id, paused) => rpc("office_set_agent_paused", { p_agent: id, p_paused: paused }),
    saveConnection: (c) => rpc("office_save_connection", { p_id: null, p_kind: c.kind, p_provider: c.provider, p_label: c.label, p_endpoint: c.endpoint ?? null, p_acp_agent: null, p_terms_version: c.termsVersion ?? null }),
    setConnectionEnabled: (id, enabled) => rpc("office_set_connection_enabled", { p_id: id, p_enabled: enabled }),
    openThread: (kind, ids, title, lead) => rpc("office_open_thread", { p_kind: kind, p_agent_ids: ids, p_title: title ?? "", p_lead: lead ?? null }),
    sendMessage: async (thread, body, mentions, key) => {
      await rpc("office_send_message", { p_thread: thread, p_body: body, p_idempotency_key: key, p_mentions: mentions })
    },
    setThreadModel: (thread, agent, conn, model) => rpc("office_set_thread_model", { p_thread: thread, p_agent: agent, p_connection: conn, p_model: model ?? null }),
    continueWith: (thread, agent, key) => rpc("office_continue_with", { p_thread: thread, p_agent: agent, p_idempotency_key: key }),
    installSkill: (agent, skill, pin) => rpc("office_install_skill", { p_agent: agent, p_skill: skill, p_pin: pin ?? null }),
    uninstallSkill: (agent, skill) => rpc("office_uninstall_skill", { p_agent: agent, p_skill: skill }),
    ackSkillUpdate: (agent, skill, mode) => rpc("office_ack_skill_update", { p_agent: agent, p_skill: skill, p_mode: mode }),
    savePersonalSkill: (s) => rpc("dock_save_skill", { p_skill: null, p_scope: "pessoal", p_area: null, p_name: s.name, p_description: s.description, p_label: "0.1", p_what_changed: null, p_body: s.body }),
    proposeSkill: (p) => rpc("dock_propose_skill", {
      p_area: p.areaId, p_skill: p.skillId, p_source: p.sourceSkillId ?? null, p_name: p.name, p_description: p.description ?? "", p_label: p.label,
      p_what_changed: p.whatChanged, p_why: p.why, p_body: p.body, p_min_level: p.minLevel,
    }),
    decideProposal: (id, approve, note) => rpc("dock_decide_skill_proposal", { p_id: id, p_approve: approve, p_note: note ?? null }),
    installConnector: (agent, c, ro) => rpc("office_install_connector", { p_agent: agent, p_connector: c, p_read_only: ro }),
    uninstallConnector: (agent, c) => rpc("office_uninstall_connector", { p_agent: agent, p_connector: c }),
    setGrant: (agent, c, action, on) => rpc("office_set_action_grant", { p_agent: agent, p_connector: c, p_action: action, p_on: on }),
    requestConnector: async (name, url, why) => {
      await rpc("dock_request_connector", { p_name: name, p_url: url, p_why: why })
    },
    decideRequest: (id, accept, note) => rpc("dock_decide_connector_request", { p_id: id, p_accept: accept, p_note: note ?? null, p_connector: null }),
    decideApproval: (id, approve, draft, always) => rpc("office_decide_approval", { p_id: id, p_approve: approve, p_draft: draft ?? null, p_always: !!always, p_note: null }),
    saveRoutine: (r) => rpc("office_save_routine", { p_id: r.id ?? null, p_agent: r.agentId, p_title: r.title, p_prompt: r.prompt, p_kind: r.kind, p_time: r.time, p_weekday: r.weekday ?? null, p_monthday: r.monthday ?? null, p_tz: "America/Sao_Paulo" }),
    setRoutineEnabled: (id, enabled) => rpc("office_set_routine_enabled", { p_id: id, p_enabled: enabled }),
  }
}
