# IA Office — estados, supervisão e evolução

## Objetivo e princípio

O IA Office é uma área de supervisão e registro. Não se deve apresentar cadastro de agente como prova de autonomia. O estado visível deve distinguir:

1. **Sugestão / hipótese** — proposta que ainda requer avaliação humana.
2. **Execução** — job que foi efetivamente colocado na fila, assumido por worker ou concluído.
3. **Falha / intervenção** — erro, tentativa esgotada, dead letter ou ação humana necessária.
4. **Aprendizado registrado** — nota que reúne evidência e confiança declarada; não equivale automaticamente a resultado validado.
5. **Validado** — hipótese que percorreu proposta → aprovação humana → teste → validação, com evidência e decisão registrada.

A interface foi ajustada para filtrar a atividade por sugestões, execuções, falhas e aprendizados, além de explicitar que um evento de aprendizado não significa validação. Hipóteses validadas continuam distinguíveis pelo seu estado de domínio.

## O que existe no código atual

- `src/app/ai-office/page.tsx`: tela principal, agentes, feed de eventos, dados de conversão, aprendizados e hipóteses.
- `src/lib/domain/ai-office.ts`: agentes iniciais, tipos de eventos, estados e transições de hipótese.
- `src/lib/event-service.ts`: grava eventos na tabela `events`, publica para handlers e recebe inserts por Supabase Realtime.
- `src/components/ai-office/ops-store.ts`, `jobs-monitor.tsx`, `workers-panel.tsx`, `webhooks-panel.tsx`: monitoramento da fila, workers e webhooks.
- `supabase/migrations/0010_ai_office.sql`: `events`, `agents`, `learnings`, `hypotheses`, com RLS de membros.
- `supabase/migrations/0011_job_queue.sql`: fila `ai_jobs`, workers, webhooks, entregas, receipts, idempotência, correlação e RPCs de execução.
- `src/app/api/ai-office/[action]/route.ts`: ações humanas autenticadas para jobs, workers, webhooks e configuração.

### Limites que precisam permanecer explícitos

- `preferredModel` é uma preferência de configuração, não prova que um provedor foi chamado.
- Agentes cadastrados não significam que exista execução autônoma contínua. A execução depende de jobs, workers habilitados, credenciais e ferramentas configuradas.
- Um job `completed` indica conclusão técnica do job, não validação humana do conteúdo produzido.
- A tabela `events` é um histórico de eventos; ela não substitui um registro de execução com entrada, saída, versão de prompt/modelo, custo, latência e avaliação.
- As tabelas `agents`, `learnings` e `hypotheses` usam JSON em `data`; isso facilita evolução, mas requer validação de schema no serviço e migrações controladas quando a estrutura virar contrato estável.
- A RLS vista nas migrations protege membros do workspace, não implementa, por si só, permissões detalhadas por setor, agente ou dado. Validar autorização por ação e escopo antes de integrar novos provedores.
- Erros de workers/jobs são visíveis no monitor existente. Eventos de negócio podem não ter detalhe suficiente para diagnosticar falhas de integração sem correlation ID e logs estruturados.

## Modelo de dados recomendado para a próxima etapa

| Entidade | Campos mínimos sugeridos | Regra |
|---|---|---|
| Agent definition | `id`, `name`, `provider`, `model`, `enabled`, `capabilities[]`, `scopes[]`, `owner`, `version` | Definição separada do estado de execução. |
| Agent run | `run_id`, `agent_id`, `provider`, `model`, `status`, `started_at`, `finished_at`, `input_ref`, `output_ref`, `error_code`, `usage`, `correlation_id` | Cada execução é rastreável; nunca guardar segredos no registro. |
| Suggestion | `id`, `run_id`, `entity_ref`, `summary`, `evidence_refs[]`, `status`, `reviewed_by`, `reviewed_at` | Não produz efeito de negócio antes de aprovação, quando aplicável. |
| Validation / learning | `id`, `source_run_id`, `evidence_refs[]`, `validation_method`, `validated_by`, `validated_at`, `status` | Resultado validado precisa de evidência e responsável. |
| Integration | `id`, `provider`, `scopes[]`, `secret_ref`, `enabled`, `health`, `last_success_at` | Referência ao segredo, nunca o segredo em texto. |

Esta tabela é uma proposta; não adiciona tabelas nesta entrega.

## Controles recomendados

- Autorizar cada ferramenta por escopo e entidade, não apenas pelo nome do agente.
- Usar aprovação humana para envio externo, alteração financeira, exclusão, mudança de regra comercial e ações irreversíveis.
- Registrar `actor`, `correlation_id`, `causation_id`, `idempotency_key`, status, duração e código de erro.
- Exibir separadamente estado do job e estado de validação do resultado.
- Definir retenção para entradas/saídas de modelos, especialmente se contiverem dados de clientes.
- Nunca expor tokens, chaves de API ou payloads sensíveis em logs visíveis ao navegador.

## Critérios de aceite da evolução

- O usuário consegue identificar uma sugestão, uma execução concluída, uma falha e um resultado validado sem inferir um estado a partir de outro.
- Falhas mostram ação possível: repetir, cancelar, revisar permissão ou encaminhar para responsável.
- Cada execução é correlacionável ao evento que a originou e ao registro de negócio afetado.
- Agentes e provedores novos podem ser adicionados por configuração/adapter, sem condicionar o front-end a uma lista fixa de nomes.
- Permissões de usuário, agente, worker e integração são testadas separadamente.
