# 0020. Acesso por área no banco (áreas restritas, concessões e vitrine)

- **Status:** Proposto
- **Data:** 2026-11-09

## Contexto

O ADR 0005 colocou no banco o **nível** de cada pessoa (owner, admin, operator, viewer). Esse nível
vale para a empresa inteira: um operator lê e grava leads, tarefas e também o Financeiro. As abas por
pessoa (ADR 0012) só organizam o menu e não protegem dados.

Os founders pediram (Gabriel, 09/11/2026) que cada pessoa acesse "as máquinas que seu cargo
representa ou necessita", que o financeiro fique só com quem precisa e que o resto da empresa veja a
estrutura sem ver os dados ("vitrine"), "pra evitar que algum que independente do cargo vaze
operações alheias da empresa". O desenho completo (salas, vitrine, construtor e IA Office) está no
cofre da HZK, nota "19 - IA Office - desenho".

Restrição de projeto: o time já usa o sistema. Uma mudança de acesso não pode trancar ninguém do
dia para a noite.

## Decisão

1. **Área restrita é opt-in.** Cada área (`public.areas`) ganha a marca `restricted` no `data`. Por
   padrão nenhuma é restrita, e o comportamento continua o do ADR 0005. Só um **owner** marca ou
   desmarca uma área como restrita: um gatilho no banco recusa a mudança vinda de outro nível, para
   que um admin não consiga destrancar o que foi trancado.
2. **Níveis por área:** `vitrine` < `ver` < `operar` < `aprovar` < `gerir`.
   - **Owner:** `gerir` em todas as áreas.
   - **Área não restrita:** vale o nível da empresa (viewer→ver, operator→operar, admin→aprovar),
     e uma concessão pode subir esse nível.
   - **Área restrita:** só vale a concessão explícita. Sem concessão, a pessoa fica em `vitrine`:
     vê a área (nome, dono, descrição) em `areas`, mas não recebe nenhum dado dela.
   - Gravar exige as duas coisas: o nível da empresa (`can_write`/`can_configure`, ADR 0005) **e**
     `operar` na área.
3. **Concessões** (`public.area_access`): pessoa × área × nível, com validade opcional (`expires_at`).
   Uma concessão vencida deixa de valer sozinha, sem tarefa agendada.
   - **Owner** concede qualquer nível.
   - **Construtor:** quem tem `gerir` numa área concede até `operar` **naquela área**.
   - `aprovar` e `gerir` só por owner.
   - Toda concessão, mudança e retirada gera um evento em `events` (`access.granted`,
     `access.changed`, `access.revoked`), e a mudança de restrição gera `area.restricted` ou
     `area.unrestricted`.
4. **Que dados pertencem a que área** (primeira leva):
   - `transactions` e `finance_settings` → `financeiro`;
   - `leads` e `activities` → `comercial`;
   - `tasks` → a área do próprio item (`data.areaId`). Uma tarefa sem área segue a regra geral. Quem
     é responsável ou colaborador da tarefa sempre a vê, mesmo sem acesso à área.

   Conteúdos, mapas, metas e o AI Office ficam para uma próxima leva, com o mesmo mecanismo.
5. **Uma regra, três lugares:** a migration `0025_acesso_por_area.sql`, as regras puras em
   `src/lib/domain/area-access.ts` e o teste `src/lib/server/area-access.rls.test.ts`, que roda as
   migrations reais num Postgres de teste e confere cada caso.

## Consequências

- **Nada muda até um owner restringir uma área.** A migration pode ir para produção sem trancar
  ninguém.
- Ao restringir o Financeiro, quem não tem concessão deixa de receber os lançamentos. Telas que somam
  lançamentos (Início, metas por receita) passam a mostrar só o que a pessoa vê. Mostrar a essas
  pessoas um número agregado (por exemplo, a % da meta) sem os lançamentos exige cálculo no servidor,
  que fica para um próximo PR.
- Com o Comercial restrito, quem trabalha em Lançamentos e usa o Pipeline precisa de concessão no
  Comercial.
- A tela para gerenciar áreas restritas e concessões vem no PR seguinte. Até lá, o owner gerencia
  pelo SQL Editor.
- A permissão continua por área, não por registro. "Cada um vê só os próprios leads" seria outro ADR.
