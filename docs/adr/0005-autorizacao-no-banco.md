# 0005. Autorização por cargo aplicada no banco

- **Status:** Aceito
- **Data:** 2026-10-30

## Contexto

Os níveis de acesso (owner, admin, operator, viewer) foram criados na migration 0017, mas as regras
do banco (RLS) das tabelas de dados só perguntavam "é membro?". O nível era respeitado apenas pela
tela, com `useAccess` escondendo botões. Qualquer pessoa logada, inclusive um viewer, podia criar,
editar e apagar dados chamando a API do Supabase direto, com a chave pública que está no navegador.

Além disso, o formulário de convite gravava `members` direto pelo navegador. Isso falhava em
produção (o papel `authenticated` não tem permissão de escrita nessa tabela) e, se a permissão
fosse liberada para "consertar", abriria uma escalada de privilégio.

Fundamentos, de Saltzer & Schroeder, "The Protection of Information in Computer Systems" (1975):
- **Menor privilégio:** cada pessoa recebe só o que precisa para o seu papel.
- **Mediação completa:** todo acesso é checado no ponto em que o dado é guardado, não só na entrada.
- **Padrão seguro (fail-safe defaults):** sem permissão explícita, a resposta é "não".

## Decisão

1. **O banco é a barreira.** A migration `0019_permissoes_por_cargo.sql` faz a RLS exigir:
   - ler dados do negócio: membro ativo (`private.is_member()`);
   - gravar dados do negócio, eventos e arquivos: `private.can_write()` (operator ou acima);
   - gravar configurações (`finance_settings`): `private.can_configure()` (admin ou acima);
   - membros e owners: travas da 0017/0018 (só admin gerencia; só owner mexe em owner).
2. **Uma matriz só.** `PERMISSIONS` em `src/lib/domain/org.ts` descreve a mesma regra para a tela.
   O teste `src/lib/server/rls.test.ts` roda as migrations reais num Postgres de teste (PGlite) e
   confirma cada cargo contra o banco. A tela usa `can(level, permissão)` só para esconder o que a
   pessoa não pode fazer.
3. **Operações sensíveis passam pelo servidor.** Convidar membro usa `POST /api/equipe/convites`,
   que confere o nível de quem convida, cria a conta com a chave de servidor e registra o evento
   `member.invited` no histórico. O navegador não grava em `members`.

## Consequências

- Um viewer passa a ser realmente somente leitura, mesmo fora da tela.
- Mudar o que um cargo pode fazer exige mudar **três lugares juntos**: a migration nova, `PERMISSIONS`
  e o teste. O teste falha se só um mudar.
- Telas que ainda não escondem botões para viewer vão mostrar um erro do banco quando ele tentar
  gravar. Isso é seguro, mas pede ajustes de interface aos poucos, usando `useAccess().canEdit`.
- Permissão por **registro** (por exemplo, "operator só edita os próprios leads") não existe ainda.
  Se for necessária, vira um ADR novo.
