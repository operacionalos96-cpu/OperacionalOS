"use client"

import {
  DOCK_RELEASE,
  connectionFor,
  connectorBlock,
  endpointOk,
  grantAllowed,
  skillBlock,
  type DockAgent,
  type DockData,
  type DockMessage,
} from "@/lib/domain/dock"
import type { DockApi } from "./api"

/**
 * MODO DEMONSTRAÇÃO do Dock (NEXT_PUBLIC_SANDBOX=1): tudo no navegador (localStorage), com as mesmas
 * travas do banco nos pontos que a tela mostra, e uma resposta simulada do bot. Não existe em produção.
 */
const KEY = "sandbox:dock:v1"
const ME = "u1"
let seq = 0
const id = (p: string) => `${p}_${Date.now().toString(36).toUpperCase()}${(seq++).toString(36).toUpperCase()}`.padEnd(30, "0").slice(0, 30)
const iso = (minAgo = 0) => new Date(Date.now() - minAgo * 60_000).toISOString()
const fail = (code: string) => {
  throw new Error(code)
}

const agent = (p: Partial<DockAgent> & Pick<DockAgent, "id" | "name" | "title">): DockAgent => ({
  description: "", instructions: "", parentAgentId: null, connectionId: "con_or", model: "deepseek-flash:free", backupModels: [],
  capabilities: ["texto"], effort: "medium", paused: false, canCreateAgents: false, accessLevel: 0, avatarStyle: "constelacao",
  avatarColor: "aco", avatarGlyph: "", origin: "do_zero", pcPending: null, ...p,
})
const msg = (p: Partial<DockMessage> & Pick<DockMessage, "threadId" | "authorType" | "authorId" | "body">): DockMessage => ({
  id: id("msg"), kind: "texto", report: null, provider: null, model: null, connectionId: null, fallbackFrom: null, fallbackReason: null, createdAt: iso(), ...p,
})

function seed(): DockData {
  const agents: DockAgent[] = [
    agent({ id: "agt_pesq", name: "Pesquisadora", title: "Pesquisa mercado e concorrentes", avatarColor: "aco", avatarGlyph: "lupa", accessLevel: 1, connectionId: "con_or", backupModels: [{ connectionId: "con_ollama", model: "qwen3:14b" }], origin: "modelo_area", instructions: "Pesquise em fontes públicas e sempre dê o link." }),
    agent({ id: "agt_dev", name: "Dev do site", title: "Faz e mantém os sites dos clientes", avatarStyle: "halo", avatarColor: "musgo", avatarGlyph: "codigo", accessLevel: 1, connectionId: "con_claude", model: "claude-sonnet-5-5", backupModels: [{ connectionId: "con_or", model: "qwen3-coder:free" }], origin: "modelo_area", instructions: "Siga o Padrão de código HZK. Escreva os testes; eles rodam no GitHub quando o PR abre." }),
    agent({ id: "agt_coord", name: "Coordenadora", title: "Divide pedidos grandes e junta o resultado", avatarColor: "grafite", connectionId: "con_claude", model: "claude-sonnet-5-5", canCreateAgents: true }),
    agent({ id: "agt_ana", name: "Analista", title: "Números do funil e do caixa", avatarStyle: "saturno", avatarColor: "vinho", avatarGlyph: "barras", accessLevel: 1, connectionId: "con_gemini", model: "gemini-3.8-flash", origin: "modelo_area" }),
    agent({ id: "agt_org", name: "Organizadora", title: "Minha semana, prazos e lembretes", avatarColor: "areia", connectionId: "con_ollama", model: "qwen3:14b", origin: "modelo_pessoal" }),
  ]
  const threads = [
    { id: "thr_dev", kind: "direta" as const, title: "", agentIds: ["agt_dev"], leadAgentId: "agt_dev", archived: false, continuedFromThreadId: null, createdAt: iso(300) },
    { id: "thr_pesq", kind: "direta" as const, title: "", agentIds: ["agt_pesq"], leadAgentId: "agt_pesq", archived: false, continuedFromThreadId: null, createdAt: iso(400) },
    { id: "thr_coord", kind: "direta" as const, title: "", agentIds: ["agt_coord"], leadAgentId: "agt_coord", archived: false, continuedFromThreadId: null, createdAt: iso(500) },
    { id: "thr_site", kind: "canal" as const, title: "site-clinica", agentIds: ["agt_coord", "agt_dev", "agt_pesq"], leadAgentId: "agt_coord", archived: false, continuedFromThreadId: null, createdAt: iso(600) },
  ]
  const via = (c: string, m: string) => ({ connectionId: c, provider: c === "con_claude" ? "claude" : c === "con_or" ? "openrouter" : c === "con_ollama" ? "ollama" : "gemini", model: m })
  const messages: DockMessage[] = [
    msg({ threadId: "thr_dev", authorType: "human", authorId: ME, body: "Arrume o formulário de contato do site da clínica: ele não envia no celular.", createdAt: iso(70) }),
    msg({ threadId: "thr_dev", authorType: "agent", authorId: "agt_dev", body: "Achei: o botão fica atrás do teclado no celular e o envio não espera a validação. Corrigi e escrevi 2 testes; para publicar, preciso abrir um PR no GitHub da HZK.", ...via("con_claude", "claude-sonnet-5-5"), createdAt: iso(62) }),
    msg({ threadId: "thr_pesq", authorType: "human", authorId: ME, body: "Levante 10 clínicas odontológicas em Curitiba sem site bom.", createdAt: iso(120) }),
    msg({ threadId: "thr_pesq", authorType: "agent", authorId: "agt_pesq", kind: "relatorio", body: "Achei 10. Quatro não têm site próprio e três têm site antigo, sem versão para celular.", report: { status: "concluído", result: "10 clínicas analisadas; 7 oportunidades de site.", evidence: "clinicas-curitiba.csv", unblock: "Quer que a Analista estime o tamanho de cada uma?" }, ...via("con_ollama", "qwen3:14b"), fallbackFrom: "deepseek-flash:free", fallbackReason: "OpenRouter atingiu o limite grátis do dia", createdAt: iso(110) }),
    msg({ threadId: "thr_coord", authorType: "human", authorId: ME, body: "Monte um time para lançar o curso de motion em dezembro.", createdAt: iso(200) }),
    msg({ threadId: "thr_coord", authorType: "agent", authorId: "agt_coord", body: "Proposta: eu coordeno; a Pesquisadora levanta o público; a Analista faz as contas; um bot novo, Roteirista, escreve os roteiros. Quer que eu proponha o Roteirista?", ...via("con_claude", "claude-sonnet-5-5"), createdAt: iso(195) }),
    msg({ threadId: "thr_site", authorType: "agent", authorId: "agt_coord", body: "@Dev do site, o formulário está pronto? @Pesquisadora, as clínicas da lista já têm contato?", ...via("con_claude", "claude-sonnet-5-5"), createdAt: iso(40) }),
  ]
  const v = (skillId: string, version: number, label: string, whatChanged: string, minLevel = 0, requiredConnectors: string[] = [], ago = 2000) => ({ skillId, version, label, whatChanged, minLevel, requiredConnectors, hasScripts: false, examples: [], publishedAt: iso(ago), approvedBy: "u1" })
  return {
    consent: true,
    suspended: false,
    agents,
    connections: [
      { id: "con_ollama", kind: "local", provider: "ollama", label: "Ollama", status: "conectada", models: ["qwen3:14b", "llama4:8b"], quotaResetsAt: null, endpoint: null },
      { id: "con_or", kind: "chave", provider: "openrouter", label: "OpenRouter", status: "conectada", models: ["deepseek-flash:free", "qwen3-coder:free"], quotaResetsAt: null, endpoint: null },
      { id: "con_claude", kind: "chave", provider: "claude", label: "Claude", status: "conectada", models: ["claude-sonnet-5-5", "claude-opus-5-5"], quotaResetsAt: null, endpoint: null },
      { id: "con_gemini", kind: "chave", provider: "gemini", label: "Gemini", status: "sem_cota", models: ["gemini-3.8-flash"], quotaResetsAt: new Date(Date.now() + 3 * 3600_000).toISOString(), endpoint: null },
    ],
    threads,
    messages,
    threadModels: [],
    skills: [
      { id: "skl_pesq", scope: "area", areaId: "comercial", name: "Pesquisa de mercado HZK", description: "Levanta empresas, confere cada fonte e entrega tabela com link.", inKit: true, currentVersion: 3, archived: false, createdBy: "u2" },
      { id: "skl_codigo", scope: "area", areaId: "producao", name: "Padrão de código HZK", description: "Como a HZK escreve, testa e documenta código.", inKit: true, currentVersion: 2, archived: false, createdBy: "u1" },
      { id: "skl_orbita", scope: "area", areaId: "design", name: "Identidade Órbita", description: "Cores, cantos por papel, materiais e órbitas da marca.", inKit: true, currentVersion: 1, archived: false, createdBy: "u1" },
      { id: "skl_semanal", scope: "area", areaId: "operacao", name: "Relatório semanal", description: "Resumo da semana com números, riscos e o que destravar.", inKit: false, currentVersion: 1, archived: false, createdBy: "u2" },
      { id: "skl_email", scope: "pessoal", areaId: null, name: "Meu tom de e-mail", description: "Rascunhos no meu jeito de escrever. Nunca envia sozinho.", inKit: false, currentVersion: 1, archived: false, createdBy: "u1" },
    ],
    versions: [
      v("skl_pesq", 1, "1.0", "Primeira versão.", 0, [], 9000), v("skl_pesq", 2, "1.1", "Tabela final com a coluna \"fonte\".", 0, [], 5000), v("skl_pesq", 3, "1.2", "Sempre abre o site antes de dizer que ele não existe.", 0, [], 900),
      v("skl_codigo", 1, "3.0", "Português nos nomes de domínio.", 1, [], 6000), v("skl_codigo", 2, "3.1", "Testes antes do PR, sempre.", 1, [], 1500),
      v("skl_orbita", 1, "1.2", "Separar por tom, não por linha.", 0, [], 1200),
      v("skl_semanal", 1, "1.0", "Primeira versão.", 0, [], 3000),
      { ...v("skl_email", 1, "0.1", "Frases mais curtas.", 0, [], 700), approvedBy: null },
    ],
    agentSkills: [
      { agentId: "agt_pesq", skillId: "skl_pesq", pinnedVersion: null, seenVersion: 3 },
      { agentId: "agt_dev", skillId: "skl_codigo", pinnedVersion: null, seenVersion: 2 },
      { agentId: "agt_coord", skillId: "skl_semanal", pinnedVersion: null, seenVersion: 1 },
    ],
    proposals: [
      { id: "skp_1", areaId: "producao", skillId: "skl_codigo", name: "Padrão de código HZK", label: "3.2", whatChanged: "Conferir a tela no celular (390 px) antes de dizer que terminou.", why: "3 entregas voltaram por erro no celular em 2 semanas.", baseVersion: 2, minLevel: 1, signalCount: 4, status: "aberta", proposedBy: "u3", proposedAt: iso(300) },
    ],
    connectors: [
      { id: "arquivos", name: "Arquivos do PC", category: "produtividade", description: "Lê e escreve nas pastas que você liberou. Não tem apagar.", note: "", runsAt: "pc", minLevel: 1, wave: 1, status: "aprovado", sourceUrl: "https://github.com/modelcontextprotocol/servers", approvedBy: "u1", approvedAt: iso(1000) },
      { id: "navegador", name: "Navegador do bot", category: "pesquisa", description: "Navega num navegador separado do seu, sem as suas senhas.", note: "Perfil isolado. O porteiro é a barreira.", runsAt: "pc", minLevel: 1, wave: 1, status: "aprovado", sourceUrl: "https://github.com/microsoft/playwright-mcp", approvedBy: "u1", approvedAt: iso(1000) },
      { id: "github", name: "GitHub", category: "programacao", description: "Repositórios, issues e PRs da HZK.", note: "Começa em só leitura.", runsAt: "empresa", minLevel: 0, wave: 1, status: "aprovado", sourceUrl: "https://github.com/github/github-mcp-server", approvedBy: "u1", approvedAt: iso(1000) },
      { id: "figma", name: "Figma", category: "design", description: "Lê o design para gerar código e consultar a marca.", note: "", runsAt: "empresa", minLevel: 0, wave: 1, status: "aprovado", sourceUrl: "https://developers.figma.com/docs/figma-mcp-server/", approvedBy: "u1", approvedAt: iso(1000) },
      { id: "supabase", name: "Supabase (só leitura)", category: "dados", description: "Consulta o banco do OperacionalOS, um projeto, só leitura.", note: "", runsAt: "empresa", minLevel: 0, wave: 1, status: "aprovado", sourceUrl: "https://github.com/supabase-community/supabase-mcp", approvedBy: "u1", approvedAt: iso(1000) },
      { id: "drive", name: "Google Drive e Docs", category: "produtividade", description: "Busca, lê e edita documentos.", note: "Servidor oficial em prévia fechada do Google: leva 2.", runsAt: "empresa", minLevel: 0, wave: 2, status: "aprovado", sourceUrl: "https://developers.google.com/workspace/guides/configure-mcp-servers", approvedBy: "u1", approvedAt: iso(1000) },
    ],
    actions: [
      { connectorId: "arquivos", actionKey: "ler", label: "listar e ler", actionClass: "A", maxItems: 50, sendsOutside: false, money: false, enabled: true },
      { connectorId: "arquivos", actionKey: "escrever", label: "escrever e editar na pasta do bot", actionClass: "C", maxItems: 20, sendsOutside: false, money: false, enabled: true },
      { connectorId: "navegador", actionKey: "ler_pagina", label: "ler páginas", actionClass: "A", maxItems: 20, sendsOutside: false, money: false, enabled: true },
      { connectorId: "navegador", actionKey: "clicar", label: "clicar e digitar", actionClass: "C", maxItems: 10, sendsOutside: false, money: false, enabled: true },
      { connectorId: "navegador", actionKey: "enviar_formulario", label: "enviar formulário, comprar, entrar numa conta", actionClass: "D", maxItems: 1, sendsOutside: true, money: false, enabled: true },
      { connectorId: "github", actionKey: "ler_codigo", label: "ler código e issues", actionClass: "A", maxItems: 50, sendsOutside: false, money: false, enabled: true },
      { connectorId: "github", actionKey: "comentar", label: "comentar, abrir issue", actionClass: "B", maxItems: 5, sendsOutside: false, money: false, enabled: true },
      { connectorId: "github", actionKey: "abrir_pr", label: "abrir PR, criar branch", actionClass: "C", maxItems: 1, sendsOutside: false, money: false, enabled: true },
      { connectorId: "github", actionKey: "merge", label: "merge, apagar, mudar acesso", actionClass: "D", maxItems: 1, sendsOutside: false, money: false, enabled: true },
      { connectorId: "figma", actionKey: "ler", label: "ler arquivos e variáveis", actionClass: "A", maxItems: 20, sendsOutside: false, money: false, enabled: true },
      { connectorId: "figma", actionKey: "editar", label: "criar e mudar no arquivo", actionClass: "C", maxItems: 5, sendsOutside: false, money: false, enabled: true },
      { connectorId: "supabase", actionKey: "consultar", label: "consultar tabelas e documentação", actionClass: "A", maxItems: 20, sendsOutside: false, money: false, enabled: true },
      { connectorId: "drive", actionKey: "ler", label: "ler", actionClass: "A", maxItems: 20, sendsOutside: false, money: false, enabled: true },
    ],
    agentConnectors: [
      { agentId: "agt_dev", connectorId: "arquivos", readOnly: false, status: "conectado" },
      { agentId: "agt_dev", connectorId: "github", readOnly: false, status: "conectado" },
      { agentId: "agt_pesq", connectorId: "navegador", readOnly: true, status: "conectado" },
      { agentId: "agt_ana", connectorId: "supabase", readOnly: true, status: "conectado" },
    ],
    grants: [],
    approvals: [
      {
        id: "apr_1", agentId: "agt_dev", threadId: "thr_dev", connectorId: "github", actionKey: "abrir_pr", actionClass: "C", gate: "lote", approver: "dono", origin: "humano",
        originDetail: "sua mensagem de " + new Date(Date.now() - 70 * 60_000).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        actionLabel: "abrir PR, criar branch", ownerOkAt: null, founderOkAt: null,
        title: "Abrir PR: \"Formulário de contato no celular\"", summary: "Ação de classe C (executar) no GitHub da HZK.",
        draft: { titulo: "Formulário de contato no celular", mudancas: ["botão acima do teclado (safe area)", "envio espera a validação", "2 testes novos"], arquivos: ["contato.tsx", "contato.test.tsx"] },
        itemCount: 1, status: "pendente", createdAt: iso(61), expiresAt: new Date(Date.now() + 6 * 86_400_000).toISOString(), decidedAt: null, resultSummary: null,
      },
    ],
    requests: [{ id: "crq_1", name: "Trello", url: "https://trello.com", why: "Ler os cartões do backlog para o resumo da semana.", requestedBy: "u2", requestedAt: iso(900), status: "aberto" }],
    kitBots: [
      { id: "kbt_dev", areaId: "producao", name: "Dev de sites", title: "Faz e mantém sites", suggestedLevel: 1, skillIds: ["skl_codigo"], avatarColor: "musgo", avatarGlyph: "codigo" },
      { id: "kbt_rev", areaId: "producao", name: "Revisor de código", title: "Revisa PRs", suggestedLevel: 0, skillIds: [], avatarColor: "grafite", avatarGlyph: "R" },
      { id: "kbt_pesq", areaId: "comercial", name: "Pesquisador comercial", title: "Levanta leads e concorrentes", suggestedLevel: 1, skillIds: ["skl_pesq"], avatarColor: "aco", avatarGlyph: "lupa" },
      { id: "kbt_design", areaId: "design", name: "Designer Órbita", title: "Peças na identidade", suggestedLevel: 0, skillIds: ["skl_orbita"], avatarColor: "lilas", avatarGlyph: "D" },
    ],
    routines: [
      { id: "rtn_1", agentId: "agt_org", title: "Organizar minha semana", prompt: "Organize minha semana a partir das tarefas e da agenda.", kind: "semanal", timeLocal: "08:00", weekday: 1, monthday: null, enabled: true, nextRunAt: null, lastRunAt: iso(4000) },
      { id: "rtn_2", agentId: "agt_coord", title: "Relatório semanal", prompt: "Faça o relatório desta semana.", kind: "semanal", timeLocal: "17:00", weekday: 5, monthday: null, enabled: true, nextRunAt: null, lastRunAt: iso(9000) },
    ],
    usage: Array.from({ length: 7 }).flatMap((_, d) =>
      [["agt_pesq", "con_or", "openrouter", true, null, 40], ["agt_dev", "con_claude", "claude", false, 0.012, 22], ["agt_org", "con_ollama", "ollama", true, null, 15], ["agt_ana", "con_gemini", "gemini", true, null, 6]].flatMap(([a, c, p, free, cost, n]) =>
        Array.from({ length: Math.max(1, Math.round((n as number) * (0.4 + ((d * 37) % 10) / 10))) }).map(() => ({
          agentId: a as string, connectionId: c as string, provider: p as string, model: "x", free: free as boolean, costUsd: cost as number | null,
          fallbackFrom: (d + (n as number)) % 9 === 0 ? "deepseek-flash:free" : null, createdAt: new Date(Date.now() - d * 86_400_000 - 3600_000).toISOString(),
        })),
      ),
    ),
    policies: [{ provider: "ollama", dataClass: "local" }, { provider: "gemini", dataClass: "treina" }],
    bridge: { online: true, lastSeenAt: iso(0.3), name: "PC do escritório" },
    states: { agt_pesq: "ocioso", agt_dev: "aguardando_aprovacao", agt_coord: "ocioso", agt_ana: "sem_cota", agt_org: "ocioso" },
  }
}

export function sandboxDockApi(): DockApi {
  let d: DockData
  const listeners = new Set<() => void>()
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(d))
    } catch {
      // cheio ou bloqueado: segue em memória
    }
    listeners.forEach((l) => l())
  }
  const load = () => {
    if (d) return d
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) d = JSON.parse(raw) as DockData
    } catch {}
    d ??= seed()
    return d
  }
  const ag = (agentId: string) => load().agents.find((a) => a.id === agentId) ?? fail("office_agent_not_found")
  const later = (ms: number, fn: () => void) => setTimeout(() => {
    fn()
    save()
  }, ms)

  /** Resposta simulada: usa a IA da conversa; sem cota, a reserva. Fala de PR → pede aprovação (porteiro). */
  function reply(threadId: string, agentId: string, text: string) {
    const a = ag(agentId)
    d.states[agentId] = "trabalhando"
    save()
    later(1600, () => {
      const pick = connectionFor(d, threadId, agentId)
      const main = d.connections.find((c) => c.id === pick.connectionId)
      let conn = main
      let fallbackFrom: string | null = null
      let fallbackReason: string | null = null
      if (!main || main.status !== "conectada") {
        const b = a.backupModels.map((x) => ({ x, c: d.connections.find((c) => c.id === x.connectionId) })).find((y) => y.c?.status === "conectada")
        if (b) {
          conn = b.c
          fallbackFrom = pick.model
          fallbackReason = `${main?.label ?? "IA principal"} sem cota agora`
        }
      }
      if (!conn || conn.status !== "conectada") {
        d.states[agentId] = "sem_cota"
        d.messages.push(msg({ threadId, authorType: "system", authorId: ME, kind: "aviso", body: `${a.name} está sem IA disponível (sem cota e sem reserva). A mensagem espera na fila.` }))
        return
      }
      const pr = /\bpr\b|publica|abr(a|ir) (um )?pull/i.test(text)
      const gh = d.agentConnectors.find((c) => c.agentId === agentId && c.connectorId === "github")
      const granted0 = !!gh && !gh.readOnly && d.grants.some((g) => g.agentId === agentId && g.connectorId === "github" && g.actionKey === "abrir_pr")
      const body = pr && gh
        ? granted0 ? "Abrindo o PR: você deixou \"sempre permitir\" ligado para isso." : gh.readOnly ? "Eu abriria o PR, mas o GitHub está em só leitura para mim." : "Pronto para abrir o PR. É uma ação de classe C no GitHub da HZK: mandei para você aprovar."
        : `Feito. Resumo do pedido: "${text.slice(0, 90)}${text.length > 90 ? "…" : ""}". Se quiser, viro isso uma tarefa com prazo.`
      d.messages.push(msg({ threadId, authorType: "agent", authorId: agentId, body, connectionId: conn.id, provider: conn.provider, model: (fallbackFrom ? a.backupModels.find((x) => x.connectionId === conn!.id)?.model : pick.model) ?? conn.models[0] ?? null, fallbackFrom, fallbackReason }))
      d.usage.push({ agentId, connectionId: conn.id, provider: conn.provider, model: "x", free: conn.provider !== "claude", costUsd: conn.provider === "claude" ? 0.01 : null, fallbackFrom, createdAt: iso() })
      if (pr && gh) {
        const granted = !gh.readOnly && d.grants.some((g) => g.agentId === agentId && g.connectorId === "github" && g.actionKey === "abrir_pr")
        if (gh.readOnly) {
          d.messages.push(msg({ threadId, authorType: "system", authorId: ME, kind: "aviso", body: "Porteiro: o GitHub está em só leitura neste bot. Ação negada." }))
        } else if (granted) {
          d.messages.push(msg({ threadId, authorType: "system", authorId: ME, kind: "aviso", body: "Porteiro: \"sempre permitir\" ligado para abrir PR. Ação liberada e registrada." }))
        } else {
          d.approvals.unshift({
            id: id("apr"), agentId, threadId, connectorId: "github", actionKey: "abrir_pr", actionClass: "C", gate: "lote", approver: "dono", origin: "humano",
            originDetail: "sua mensagem", actionLabel: "abrir PR, criar branch", ownerOkAt: null, founderOkAt: null, title: `Abrir PR: "${text.slice(0, 60)}"`, summary: "Ação de classe C (executar) no GitHub da HZK.",
            draft: { titulo: text.slice(0, 80) }, itemCount: 1, status: "pendente", createdAt: iso(), expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(), decidedAt: null, resultSummary: null,
          })
          d.states[agentId] = "aguardando_aprovacao"
          return
        }
      }
      d.states[agentId] = "ocioso"
    })
  }

  return {
    mode: "sandbox",
    load: async () => structuredClone(load()),
    subscribe(onChange) {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
    async acceptConsent() {
      load().consent = true
      save()
    },
    async createAgent(a) {
      load()
      if (d.agents.length >= 20) fail("office_limit_agents")
      const nid = id("agt")
      d.agents.push(agent({ id: nid, name: a.name, title: a.title, instructions: a.instructions, connectionId: a.connectionId, model: a.model, canCreateAgents: !!a.canCreateAgents, avatarColor: "grafite" }))
      d.states[nid] = "ocioso"
      save()
      return nid
    },
    async createAgentFromKit(kitId, name) {
      load()
      const k = d.kitBots.find((x) => x.id === kitId) ?? fail("dock_kit_not_found")
      const nid = id("agt")
      d.agents.push(agent({ id: nid, name: name || k.name, title: k.title, avatarColor: k.avatarColor, avatarGlyph: k.avatarGlyph, origin: "modelo_area", accessLevel: 0, connectionId: d.connections[0]?.id ?? null }))
      for (const sid of k.skillIds) {
        const s = d.skills.find((x) => x.id === sid)
        const v = s && d.versions.find((x) => x.skillId === sid && x.version === s.currentVersion)
        if (s && v && v.minLevel === 0) d.agentSkills.push({ agentId: nid, skillId: sid, pinnedVersion: null, seenVersion: s.currentVersion })
      }
      d.states[nid] = "ocioso"
      save()
      return nid
    },
    async updateAgent(aid, p) {
      const a = ag(aid)
      Object.assign(a, { name: p.name, title: p.title, instructions: p.instructions, connectionId: p.connectionId, model: p.model, backupModels: p.backupModels.slice(0, 8), canCreateAgents: !!p.canCreateAgents })
      save()
    },
    async setAccess(aid, level) {
      if (level > DOCK_RELEASE.maxLevel) fail("office_level_not_released")
      const a = ag(aid)
      a.accessLevel = level
      const cut = new Set(d.connectors.filter((c) => c.minLevel > level).map((c) => c.id))
      d.grants = d.grants.filter((g) => !(g.agentId === aid && cut.has(g.connectorId)))
      save()
    },
    async setAvatar(aid, style, color, glyph) {
      const a = ag(aid)
      if (style) a.avatarStyle = style
      if (color) a.avatarColor = color
      if (glyph !== null) a.avatarGlyph = glyph
      save()
    },
    async setPaused(aid, paused) {
      ag(aid).paused = paused
      d.states[aid] = paused ? "pausado" : "ocioso"
      save()
    },
    async saveConnection(c) {
      load()
      if (c.kind === "compativel" && (!c.termsVersion || !c.endpoint || !endpointOk(c.endpoint))) fail(c.termsVersion ? "office_invalid_endpoint" : "office_terms_required")
      const nid = id("con")
      d.connections.push({ id: nid, kind: c.kind, provider: c.provider, label: c.label, status: "pendente", models: [], quotaResetsAt: null, endpoint: c.endpoint ?? null })
      save()
      later(1200, () => {
        const x = d.connections.find((y) => y.id === nid)
        if (x) Object.assign(x, { status: "conectada", models: c.kind === "local" ? ["llama4:8b"] : ["padrão"] })
      })
      return nid
    },
    async setConnectionEnabled(cid, enabled) {
      const c = load().connections.find((x) => x.id === cid) ?? fail("office_connection_not_found")
      c.status = enabled ? "conectada" : "desligada"
      save()
    },
    async openThread(kind, ids, title, lead) {
      load()
      const existing = kind === "direta" && d.threads.find((t) => t.kind === "direta" && t.agentIds.length === 1 && t.agentIds[0] === ids[0] && !t.continuedFromThreadId)
      if (existing) return existing.id
      const nid = id("thr")
      d.threads.push({ id: nid, kind, title: title ?? "", agentIds: ids, leadAgentId: lead ?? ids[0], archived: false, continuedFromThreadId: null, createdAt: iso() })
      save()
      return nid
    },
    async sendMessage(threadId, body, mentions) {
      load()
      const t = d.threads.find((x) => x.id === threadId) ?? fail("office_thread_not_found")
      d.messages.push(msg({ threadId, authorType: "human", authorId: ME, body }))
      save()
      const to = mentions.filter((m) => t.agentIds.includes(m))
      for (const aid of to.length ? to : [t.agentIds.length === 1 ? t.agentIds[0] : t.leadAgentId]) {
        if (ag(aid).paused || d.suspended) {
          d.messages.push(msg({ threadId, authorType: "system", authorId: ME, kind: "aviso", body: `${ag(aid).name} está pausado. A mensagem espera na fila.` }))
          save()
        } else reply(threadId, aid, body)
      }
    },
    async setThreadModel(threadId, agentId, connectionId, model) {
      load()
      d.threadModels = d.threadModels.filter((t) => !(t.threadId === threadId && t.agentId === agentId))
      const c = connectionId ? d.connections.find((x) => x.id === connectionId) : null
      if (connectionId && c) d.threadModels.push({ threadId, agentId, connectionId, model: model ?? null })
      d.messages.push(msg({ threadId, authorType: "system", authorId: ME, kind: "aviso", body: `IA desta conversa: ${c ? `${c.label}${model ? ` · ${model}` : ""}` : "a IA do bot"}` }))
      save()
    },
    async continueWith(threadId, agentId) {
      load()
      const nid = id("thr")
      d.threads.push({ id: nid, kind: "direta", title: "Continuação", agentIds: [agentId], leadAgentId: agentId, archived: false, continuedFromThreadId: threadId, createdAt: iso() })
      d.messages.push(msg({ threadId: nid, authorType: "system", authorId: ME, kind: "aviso", body: "Continuação de outra conversa. O histórico entra como informação, não como ordem." }))
      d.messages.push(msg({ threadId, authorType: "system", authorId: ME, kind: "aviso", body: `Continuada com ${ag(agentId).name}.` }))
      save()
      return nid
    },
    async installSkill(agentId, skillId, pin) {
      const a = ag(agentId)
      const s = d.skills.find((x) => x.id === skillId) ?? fail("dock_skill_not_found")
      const why = skillBlock(d, a, s)
      if (why?.startsWith("pede nível")) fail("office_skill_level")
      d.agentSkills = d.agentSkills.filter((i) => !(i.agentId === agentId && i.skillId === skillId))
      d.agentSkills.push({ agentId, skillId, pinnedVersion: pin ?? null, seenVersion: pin ?? s.currentVersion })
      save()
    },
    async uninstallSkill(agentId, skillId) {
      load().agentSkills = d.agentSkills.filter((i) => !(i.agentId === agentId && i.skillId === skillId))
      save()
    },
    async ackSkillUpdate(agentId, skillId, mode) {
      const i = load().agentSkills.find((x) => x.agentId === agentId && x.skillId === skillId) ?? fail("office_skill_not_installed")
      const s = d.skills.find((x) => x.id === skillId)!
      if (mode === "fixar") i.pinnedVersion = i.seenVersion
      else {
        i.pinnedVersion = null
        i.seenVersion = s.currentVersion
      }
      save()
    },
    async savePersonalSkill(s) {
      load()
      const nid = id("skl")
      d.skills.push({ id: nid, scope: "pessoal", areaId: null, name: s.name, description: s.description, inKit: false, currentVersion: 1, archived: false, createdBy: ME })
      d.versions.push({ skillId: nid, version: 1, label: "0.1", whatChanged: "Primeira versão.", minLevel: 0, requiredConnectors: [], hasScripts: false, examples: [], publishedAt: iso(), approvedBy: null })
      save()
      return nid
    },
    async proposeSkill(p) {
      load()
      const nid = id("skp")
      const base = p.skillId ? d.skills.find((s) => s.id === p.skillId)?.currentVersion ?? null : null
      d.proposals.unshift({ id: nid, areaId: p.areaId, skillId: p.skillId, name: p.name, label: p.label, whatChanged: p.whatChanged, why: p.why, baseVersion: base, minLevel: p.minLevel, signalCount: 0, status: "aberta", proposedBy: ME, proposedAt: iso() })
      save()
      return nid
    },
    async decideProposal(pid, approve) {
      const p = load().proposals.find((x) => x.id === pid) ?? fail("dock_proposal_not_found")
      if (p.status !== "aberta") fail("dock_proposal_closed")
      p.status = approve ? "aprovada" : "recusada"
      if (approve) {
        let sid = p.skillId
        if (!sid) {
          sid = id("skl")
          d.skills.push({ id: sid, scope: "area", areaId: p.areaId, name: p.name, description: "", inKit: false, currentVersion: 0, archived: false, createdBy: p.proposedBy })
        }
        const s = d.skills.find((x) => x.id === sid)!
        s.currentVersion += 1
        d.versions.push({ skillId: sid, version: s.currentVersion, label: p.label, whatChanged: p.whatChanged, minLevel: p.minLevel, requiredConnectors: [], hasScripts: false, examples: [], publishedAt: iso(), approvedBy: ME })
      }
      save()
    },
    async installConnector(agentId, connectorId, readOnly) {
      const a = ag(agentId)
      const c = d.connectors.find((x) => x.id === connectorId) ?? fail("dock_unknown_connector")
      const why = connectorBlock(c, a)
      if (why) fail(why.startsWith("pede nível") ? "office_connector_level" : "dock_unknown_connector")
      const cur = d.agentConnectors.find((x) => x.agentId === agentId && x.connectorId === connectorId)
      if (cur) cur.readOnly = readOnly
      else d.agentConnectors.push({ agentId, connectorId, readOnly, status: "pendente" })
      if (readOnly) d.grants = d.grants.filter((g) => !(g.agentId === agentId && g.connectorId === connectorId))
      save()
      later(900, () => {
        const x = d.agentConnectors.find((y) => y.agentId === agentId && y.connectorId === connectorId)
        if (x) x.status = "conectado"
      })
    },
    async uninstallConnector(agentId, connectorId) {
      load()
      d.agentConnectors = d.agentConnectors.filter((x) => !(x.agentId === agentId && x.connectorId === connectorId))
      d.grants = d.grants.filter((g) => !(g.agentId === agentId && g.connectorId === connectorId))
      save()
    },
    async setGrant(agentId, connectorId, actionKey, on) {
      load()
      d.grants = d.grants.filter((g) => !(g.agentId === agentId && g.connectorId === connectorId && g.actionKey === actionKey))
      if (on) {
        if (!d.agentConnectors.some((x) => x.agentId === agentId && x.connectorId === connectorId && !x.readOnly)) fail("office_connector_not_installed")
        const act = d.actions.find((x) => x.connectorId === connectorId && x.actionKey === actionKey)
        if (!act || !grantAllowed(act)) fail("office_grant_only_class_c")
        d.grants.push({ agentId, connectorId, actionKey, expiresAt: new Date(Date.now() + 90 * 86_400_000).toISOString() })
      }
      save()
    },
    async requestConnector(name, url, why) {
      load().requests.unshift({ id: id("crq"), name, url, why, requestedBy: ME, requestedAt: iso(), status: "aberto" })
      save()
    },
    async decideRequest(rid, accept) {
      const r = load().requests.find((x) => x.id === rid) ?? fail("dock_request_not_found")
      r.status = accept ? "aceito" : "recusado"
      save()
    },
    async decideApproval(aid, approve, draft, always) {
      const a = load().approvals.find((x) => x.id === aid) ?? fail("office_approval_not_found")
      if (a.status !== "pendente") fail("office_approval_closed")
      if (always && (!approve || a.actionClass !== "C" || a.origin !== "humano")) fail("office_grant_only_class_c")
      if (always) d.grants.push({ agentId: a.agentId, connectorId: a.connectorId, actionKey: a.actionKey, expiresAt: new Date(Date.now() + 90 * 86_400_000).toISOString() })
      a.status = approve ? "aprovada" : "recusada"
      a.decidedAt = iso()
      if (approve && draft) a.draft = draft
      d.states[a.agentId] = approve ? "trabalhando" : "ocioso"
      save()
      if (approve)
        later(1400, () => {
          a.status = "executada"
          a.resultSummary = "PR #44 aberto."
          d.states[a.agentId] = "ocioso"
          if (a.threadId) d.messages.push(msg({ threadId: a.threadId, authorType: "agent", authorId: a.agentId, body: `Feito: ${a.title.replace(/^Abrir PR: /, "PR aberto: ")}. Registro: feito pela ${ag(a.agentId).name}, aprovado por você.` }))
        })
    },
    async saveRoutine(r) {
      load()
      if (r.kind === "semanal" && r.weekday == null) fail("office_invalid_schedule")
      if (r.id) {
        const x = d.routines.find((y) => y.id === r.id) ?? fail("office_routine_not_found")
        Object.assign(x, { agentId: r.agentId, title: r.title, prompt: r.prompt, kind: r.kind, timeLocal: r.time, weekday: r.weekday ?? null, monthday: r.monthday ?? null })
        save()
        return x.id
      }
      const nid = id("rtn")
      d.routines.push({ id: nid, agentId: r.agentId, title: r.title, prompt: r.prompt, kind: r.kind, timeLocal: r.time, weekday: r.weekday ?? null, monthday: r.monthday ?? null, enabled: true, nextRunAt: null, lastRunAt: null })
      save()
      return nid
    },
    async setRoutineEnabled(rid, enabled) {
      const x = load().routines.find((y) => y.id === rid) ?? fail("office_routine_not_found")
      x.enabled = enabled
      save()
    },
  }
}
