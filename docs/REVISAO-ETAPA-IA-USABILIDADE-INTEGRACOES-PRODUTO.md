# Registro da etapa: IA Office, diagnóstico de usabilidade, integrações e hipótese de produto

## Escopo desta entrega

- Ajuste pontual no IA Office para tornar o feed filtrável e distinguir visualmente eventos de negócio, sugestões, execuções, falhas e aprendizados registrados.
- Documentação da arquitetura e dos limites atuais do IA Office.
- Plano de contratos para APIs, webhooks, automação e provedores de IA, com uma integração inicial proposta para validação.
- Diagnóstico estático das áreas navegação, busca, criação global, metas e cofre. Essas áreas não foram reformuladas.
- Ficha de descoberta e viabilidade para a hipótese de produto Content Ops. A recomendação é validar antes de programar.

## Arquivos

- `src/app/ai-office/page.tsx`
- `docs/AI-OFFICE-ESTRUTURA-E-EVOLUCAO.md`
- `docs/PLANO-INTEGRACOES-APIS-WEBHOOKS-N8N.md`
- `docs/DIAGNOSTICO-USABILIDADE-4-6.md`
- `docs/AVALIACAO-HIPOTESE-PRODUTO-CONTENT-OPS.md`

## Validação

Foi feita revisão estática dos arquivos e dos contratos existentes. O feed e os painéis usam stores e tabelas já existentes; não foi criada migration nesta etapa. Build, lint, Vitest e teste real no navegador precisam ser executados no ambiente com dependências instaladas e Supabase configurado. Não declarar a etapa como validada até esses comandos e os testes manuais serem concluídos.

## Critérios de aceite recomendados

1. Filtrar atividade por sugestão, execução, falha e aprendizado; conferir que os resultados mudam de forma coerente.
2. Confirmar que uma hipótese só aparece como validada após a transição humana para `validated`.
3. Provocar uma falha em ambiente de teste e confirmar que o monitor apresenta status e ação possível.
4. Testar a busca e criação global, metas e cofre com os roteiros do diagnóstico sem alterar essas áreas antes da decisão da equipe.
5. Executar a integração de webhook proposta inicialmente em modo de log/acknowledgement, sem criar tarefas ou alterar dados de negócio.
6. Fazer entrevistas de descoberta para Content Ops antes de aprovar qualquer MVP.
