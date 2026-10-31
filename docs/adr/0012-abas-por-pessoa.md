# 0012. Abas por pessoa e fase da tarefa junto com o tempo

- **Status:** Aceito
- **Data:** 2026-10-31

## Contexto

O MVP vai para o time. Com 17 abas, quem trabalha em uma área se perde no menu. Igor (owner) precisa
ver tudo. Ao mesmo tempo, o "fazendo agora" (ADR 0010) criou um segundo jeito de marcar uma tarefa
"em andamento", ao lado do círculo de status que já existia (a fazer → em andamento → feita).

## Decisão

1. **Abas por pessoa** (`src/lib/domain/access-pages.ts`):
   - **Owner:** vê tudo.
   - **Os demais:** a base do dia a dia (Início, Agenda, Caixa de entrada, Equipe, Tarefas e
     Decisões), mais as abas das áreas de que são donos ou apoio.
   - **Ajuste:** o owner muda pessoa por pessoa em Configurações › "O que cada um vê"
     (`team_settings.pagesByMember`).
   - **Onde vale:** barra lateral, celular, busca e cartões de setor. Uma aba fora do menu, aberta
     por link, mostra uma tela explicando.
   - **Isto é organização, não segurança.** Ler e gravar continuam decididos no banco (ADR 0005).
2. **Uma regra para fase e tempo** (`syncWithStatus` em `work-sessions.ts`, chamada só em
   `src/lib/actions.ts`):
   - **Fase:** é a da tarefa (sistema de sempre).
   - **Tempo:** acompanha a fase. Entrar em "andamento" abre o tempo e pausa o anterior; concluir,
     voltar para "a fazer" ou excluir fecha.
   - **Um caminho só:** ▶, círculo, checkbox, Mapas e o Plano do dia passam pelas mesmas ações.
   - **Só as ações da própria pessoa contam:** mudanças que chegam de outra pessoa não abrem nem
     fecham o seu tempo.
3. **Uma fonte para cada número repetido:**
   - `dayProgress` existe só em `rules.ts`;
   - "o que fez no período" é `doneBetween` (`team-work.ts`), usado pela Equipe e pela Semana do time.

## Consequências

- **Esconder uma aba não protege dados.** Quem precisa de proteção de verdade usa o nível de acesso.
- **A tarefa pausada continua "em andamento".** Só o tempo para.
