# Correções após verificação contra o briefing consolidado (29/10/2026)

## O que foi corrigido
| Item | Correção |
|---|---|
| 1.1 Tarefas/Notas | Nome de projeto normalizado (espaços, maiúsculas/minúsculas) em tarefas, notas e financeiro; nota liga a **várias** tarefas (`taskIds`), com ligação nos dois sentidos; busca por tarefa vinculada; corrigido bug visual do editor (barra de formatação). |
| 1.2 Financeiro | Seletor de período governa saldo, resultado, meta, gráficos, categorias e as abas Contas a pagar/receber; status Previsto / Vencido / Parcial / Realizado; baixa com **data real** e valor (parcial mantém o restante em aberto); quadro "Previsto vs realizado" na Visão geral. |
| 1.3 Marketing | Métricas por plataforma (sem somar views de plataformas diferentes), tabela marca × plataforma preservando a origem; seletor HZK/Gabriel/Visão geral visível mesmo sem conteúdo; nova conta/frente de teste validada. |
| 3.1 Integrações | Proteção SSRF implementada e testada; **piloto** lead ganho → tarefa + recebimento previsto + evento `lead.converted`, idempotente. |
| Sandbox | `ilike` adicionado ao banco simulado (só desenvolvimento) — sem isso a demonstração local não abria. |

## Verificação executada
- `tsc --noEmit`: sem erros · ESLint: 0 erros · Vitest: todos os testes passam (inclui `finance-period`, `project-names`, `won-lead`, `ssrf-rules`).
- Navegador (modo sandbox): Financeiro (criar conta a pagar, baixa parcial, período), Marketing (isolamento HZK × Gabriel, nova conta), Notas (2 tarefas, busca, detalhe da tarefa), Pipeline (Ganho → tarefa + recebimento previsto).

## Não verificado / limites
- Supabase real (RLS, realtime) e migrações em banco de verdade.
- `next build` não rodou no ambiente de teste (sem acesso ao Google Fonts); rode `npm run build` no seu ambiente.
- Evidência de demanda do produto 4.1 depende de entrevistas reais; a recomendação continua "Ajustar e validar".
- Autorização granular por setor no IA Office continua como decisão pendente (documentada).
- Navegação, busca, metas e cofre: apenas diagnóstico, sem mudança de código.
