# 0002. Camadas: domínio puro, serviços, infraestrutura, interface

- **Status:** Aceito
- **Data:** 2026-10-30

## Contexto

O código já segue uma separação na prática: regras puras e testadas em `src/lib/domain/`, acesso a
dados atrás de interfaces em `src/lib/repositories/` (padrão Repository) e código só de servidor em
`src/lib/server/`. Nada impedia, porém, que uma regra de negócio importasse React ou o cliente do
Supabase. Esse tipo de acoplamento é o que faz um sistema ficar difícil de mudar com o tempo.

Fundamentos:
- **Parnas** ("On the Criteria To Be Used in Decomposing Systems into Modules", 1972): divida o
  sistema escondendo as decisões que provavelmente vão mudar, como o banco e a tela, atrás de
  módulos estáveis.
- **Evans** (*Domain-Driven Design*, 2003): a camada de domínio guarda o conhecimento do negócio e não
  depende de infraestrutura.
- **Cockburn** ("Hexagonal Architecture / Ports and Adapters", 2005): o núcleo fala com o mundo por
  portas (interfaces); banco, HTTP e tela são adaptadores trocáveis.

## Decisão

Vamos tratar o código em quatro camadas. A dependência só aponta para dentro:

| Camada | Onde | Pode depender de | Não pode depender de |
|---|---|---|---|
| **Domínio** (regras puras) | `src/lib/domain/` | só de si mesma e de utilitários puros (`date-fns`) | React, Next, Supabase, store |
| **Serviços / casos de uso** | `src/lib/services/`, `src/lib/actions.ts`, `src/lib/server/*` (lógica) | domínio, portas (repositórios) | detalhes de tela |
| **Infraestrutura** (adaptadores) | `src/lib/repositories/`, `src/lib/supabase/`, `src/lib/server/supabase-admin.ts`, `providers.ts` | domínio | tela |
| **Interface** | `src/app/`, `src/components/`, rotas `src/app/api/` | todas as acima | — |

A regra do domínio é **verificada pelo lint** (`no-restricted-imports` em `eslint.config.mjs`). Quem
quebrar a regra vê um erro com a explicação no próprio editor e no CI.

## Consequências

- As regras de negócio rodam igual no navegador, no servidor e nos testes. É isso que permite levar
  automações para o servidor (Fase 2) reaproveitando funções como `planWonLead`.
- Trocar o banco ou a tela não exige reescrever regra de negócio.
- Para usar dados numa regra, ela precisa recebê-los por parâmetro. Dá um pouco mais de trabalho,
  mas fica testável.
- As outras camadas ainda não são verificadas por lint. Se surgir acoplamento indevido, estender a
  regra.
