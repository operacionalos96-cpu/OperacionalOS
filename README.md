# Operacional OS

Sistema do dia a dia para uma equipe de 2 pessoas: **Início (Dashboard)**, **Pipeline (CRM)**, **Produtos**, **Conteúdos**, **Financeiro**, **Tarefas & Notas** e **Mapas**.

Como adicionar módulos novos: **[docs/ARQUITETURA.md](docs/ARQUITETURA.md)**.

## Rodar

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # regras de negócio (vitest)
npm run build
```

O banco começa vazio. Dados antigos de um navegador podem ser levados para o banco em **Dados → Importar dados antigos deste navegador** (rodapé da barra lateral).

## Onde mexer

| O quê | Arquivo |
| --- | --- |
| Nomes e cores da equipe | `src/config/team.ts` |
| Estágios do pipeline, categorias financeiras, "lead parado" (7 dias) | `src/lib/domain/constants.ts` |
| Regras (parado, atenção, meta, agenda) — funções puras e testadas | `src/lib/domain/rules.ts` |
| Dados de exemplo | `src/lib/seed.ts` |
| Cores, tema escuro/claro, botões, animações e hierarquia de texto | `src/app/globals.css` (tokens) |
| Prioridades e recorrência de tarefas | `src/lib/domain/constants.ts` |

## Arquitetura

- `src/lib/domain/` — tipos + regras puras (sem React).
- `src/lib/repositories/` — **Repository Pattern**. `supabase.ts` (banco + tempo real) é o backend; `local.ts` só serve para importar dados antigos do navegador.
- `src/middleware.ts` + `src/lib/supabase/` — login e proteção de rotas.
- `src/lib/store.ts` — store (zustand) com atualização otimista; a UI só fala com ela.
- `src/lib/actions.ts` — ações com toast + "Desfazer".
- `src/components/dialogs/` — formulários globais (novo lead/tarefa/lançamento, concluir ação, ganho, perdido). Um jeito só de fazer cada coisa.

## Visual

- **Dark mode é o padrão** (troca no rodapé da barra lateral: claro / escuro / automático).
- Regra: 90% neutro + 10% verde. Verde só para positivo (entradas, meta, concluído).
- Nunca use cor solta (`text-red-600`): use os tokens `text-danger`, `text-success`, `text-warning`, `bg-brand`…
- Texto em 4 níveis: `t-title` (título), `t-label` (rótulo), `t-value` (dado), `t-desc` (descrição).
- Cores dos gráficos validadas para daltonismo (entradas verde × saídas cinza; estágios em rampa neutra).

## Tarefas

- Campo rápido entende atalhos: `Ligar pro cliente !alta #vendas` → prioridade Alta + etiqueta "vendas" (`!!!`/`!urgente`, `!!`/`!alta`, `!`/`!media`, `!baixa`).
- Clique numa tarefa para abrir o painel: prazo, prioridade, responsável, etiquetas, descrição, **checklist**, lead e **repetição** (todo dia/semana/mês: ao concluir, a próxima é criada sozinha).
- Filtros por prioridade/etiqueta, busca e ordenação por prazo ou prioridade.

## Regras de produto embutidas

- Lead **não é criado sem próxima ação + data**. Ao concluir a ação, o sistema já pede a próxima.
- **Parado** = aberto e 7+ dias sem atividade. Ação vencida = borda vermelha.
- Arrastar para **Ganho** oferece registrar a entrada no Financeiro já vinculada ao lead.
- "Você é" (rodapé da barra lateral) define o dono padrão e "Minhas responsabilidades".
- `Ctrl+K` busca leads/notas e cria qualquer coisa.

## Login e dados

Os dados ficam no **Supabase** (compartilhados entre os dois, em tempo real) e o acesso exige login.
Configuração e proteções: veja **[SEGURANCA.md](SEGURANCA.md)**. Para rodar, crie o `.env.local` a partir do `.env.example`.
