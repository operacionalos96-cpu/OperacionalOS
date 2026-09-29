# Operacional

Sistema do dia a dia para uma equipe de 2 pessoas: **Início (Dashboard)**, **Pipeline (CRM)**, **Financeiro**, **Tarefas & Notas** e **Mapas**.

## Rodar

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # regras de negócio (vitest)
npm run build
```

Na primeira abertura o sistema carrega **dados de exemplo**. Para usar de verdade: menu **Dados → Começar do zero** (rodapé da barra lateral).

## Onde mexer

| O quê | Arquivo |
| --- | --- |
| Nomes e cores da equipe | `src/config/team.ts` |
| Estágios do pipeline, categorias financeiras, "lead parado" (7 dias) | `src/lib/domain/constants.ts` |
| Regras (parado, atenção, meta, agenda) — funções puras e testadas | `src/lib/domain/rules.ts` |
| Dados de exemplo | `src/lib/seed.ts` |

## Arquitetura

- `src/lib/domain/` — tipos + regras puras (sem React).
- `src/lib/repositories/` — **Repository Pattern**. Hoje: `local.ts` (localStorage, por navegador). Para Supabase: implementar as interfaces de `types.ts` e trocar em `index.ts`. Nada mais muda.
- `src/lib/store.ts` — store (zustand) com atualização otimista; a UI só fala com ela.
- `src/lib/actions.ts` — ações com toast + "Desfazer".
- `src/components/dialogs/` — formulários globais (novo lead/tarefa/lançamento, concluir ação, ganho, perdido). Um jeito só de fazer cada coisa.

## Regras de produto embutidas

- Lead **não é criado sem próxima ação + data**. Ao concluir a ação, o sistema já pede a próxima.
- **Parado** = aberto e 7+ dias sem atividade. Ação vencida = borda vermelha.
- Arrastar para **Ganho** oferece registrar a entrada no Financeiro já vinculada ao lead.
- "Você é" (rodapé da barra lateral) define o dono padrão e "Minhas responsabilidades".
- `Ctrl+K` busca leads/notas e cria qualquer coisa.

> Os dados ficam no navegador de cada pessoa até a migração para Supabase — os dois ainda **não** compartilham dados.
