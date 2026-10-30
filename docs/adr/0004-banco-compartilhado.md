# 0004. Banco Supabase compartilhado com outros apps

- **Status:** Aceito (provisório, até a separação)
- **Data:** 2026-10-30

## Contexto

O projeto Supabase usado pelo Operacional OS (`odaeekmnzygxnlxubfon`) também guarda dados e regras
de **outros aplicativos**. Em 30/10/2026 havia, por exemplo, as tabelas `alma_par_leads`,
`cronogramas`, `cronograma_itens` e `diagnosticos`. O histórico de migrações do Supabase
(`supabase_migrations.schema_migrations`) tem registros desses apps (`workspace_fundacao`,
`workspace_brainstorm`) e só um do Operacional (a 0018).

Riscos:
- **Superfície de ataque maior.** Os usuários de autenticação são compartilhados. Quem tem conta em
  outro app tem uma sessão válida neste banco. Hoje isso é contido pela lista `members` e pela RLS,
  mas um erro de política em qualquer app afeta todos.
- **Raio de impacto.** Uma migração ou queda de um app atinge os outros. Limites de plano (conexões,
  armazenamento) são divididos.
- **Ferramentas.** O Supabase CLI (`supabase db push`) espera que o histórico de migrações seja de um
  projeto só. Registrar ali as migrações do Operacional misturaria os dois históricos e poderia
  bagunçar o outro app.

## Decisão

Por enquanto:
1. **Não vamos escrever no histórico de migrações do Supabase.** A fonte da verdade das migrações do
   Operacional é a pasta `supabase/migrations/`, numerada em sequência e verificada por teste
   (`src/lib/migrations.test.ts`). A migração mais recente aplicada em produção é anotada no PR que
   a aplica e em `COLABORACAO.md`.
2. **As migrações continuam aplicadas manualmente**, pelo SQL Editor ou pelo MCP do Supabase, só
   depois do PR aprovado e na ordem dos números.
3. **Recomendação:** criar um projeto Supabase exclusivo do Operacional OS e migrar os dados. Depois
   disso, adotar o Supabase CLI e o histórico de migrações do próprio Supabase, e substituir este ADR.

## Consequências

- Nada muda para os outros apps.
- O controle de "qual migração já está em produção" depende de disciplina, não de ferramenta. É o
  principal custo desta decisão.
- A separação do banco entra na lista de próximos passos (ver `docs/ARQUITETURA.md`).
