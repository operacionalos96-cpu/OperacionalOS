# Como trabalhar em equipe no OperacionalOS

Fluxo baseado em integração contínua (Martin Fowler, "Continuous Integration", 2006; Forsgren et al.,
*Accelerate*, 2018): mudanças pequenas, sempre revisadas e sempre testadas pela máquina antes de
entrar na `main`. A `main` é o que está no ar, então nada entra nela sem passar pelo CI.

## Toda vez que for começar a trabalhar

```bash
git checkout main
git pull
npm install          # só se o package.json mudou
git checkout -b tipo/assunto-curto
```

Nomes de branch: `feat/…` (funcionalidade), `fix/…` (correção), `fundacao/…` (estrutura, banco,
processo), `docs/…`, `visual/…`. Exemplo: `fix/convite-de-membro`.

Para rodar: `npm run dev` e abra http://localhost:3000.
Para ver o app sem login e sem banco (dados de exemplo): `NEXT_PUBLIC_SANDBOX=1 npm run dev`.

## Quando terminar uma alteração

```bash
npx tsc --noEmit && npx eslint src && npx vitest run   # o mesmo que o CI roda
git add <arquivos>
git commit -m "Descreve o que mudou e por quê"
git push -u origin tipo/assunto-curto
```

Depois, no GitHub, abra um **Pull Request** para a `main`:
- Descreva o que mudou, por que, e como testar.
- Espere o **CI ficar verde** (aba *Checks*): tipos, lint, testes e build (`.github/workflows/ci.yml`).
- O outro revisa. Aprovado e verde → **Squash and merge**.

## Regras

1. **Nada direto na `main`.** Todo código entra por PR com CI verde.
2. PRs pequenos (de preferência menos de 400 linhas), uma intenção por PR.
3. Regra de negócio nova vem com teste em `src/lib/domain/*.test.ts`.
4. Decisão de estrutura (banco, camadas, segurança, integração) vem com um ADR em `docs/adr/`.
5. Nunca suba senhas ou chaves (`.env*` é ignorado). Os segredos ficam só na Vercel e no Supabase.
6. Antes de mexer em arquivo grande e compartilhado (`src/lib/store.ts`, `src/lib/domain/types.ts`,
   `src/components/shell/*`, `src/app/globals.css`), avise o outro para evitar conflito.

## Migrations do banco (`supabase/migrations/`)

- Uma mudança de banco = um arquivo novo `NNNN_nome.sql`, com o **próximo número**. Antes de criar,
  combine o número com o outro dev: o teste `src/lib/migrations.test.ts` falha se dois PRs usarem o
  mesmo número.
- A migration deve poder rodar mais de uma vez sem quebrar (`if not exists`, `create or replace`,
  `drop policy if exists`).
- **Só aplique em produção depois do PR aprovado**, na ordem dos números, pelo SQL Editor do Supabase.
  Anote no PR: "aplicada em produção em DD/MM".
- O banco é compartilhado com outros apps (ver `docs/adr/0004-banco-compartilhado.md`): não use o
  histórico de migrações do Supabase CLI.

**Última migration aplicada em produção:** `0022_agenda_presenca.sql` (31/10/2026, depois do deploy da agenda, presença e Guia do dia).

## Se der conflito

O Git marca o trecho no arquivo com `<<<<<<<`, `=======` e `>>>>>>>`. Escolha o que fica, apague as
marcações e rode os testes. Depois:

```bash
git add <arquivo>
git commit -m "Resolve conflito em <arquivo>"
git push
```

## Deploy na Vercel (importante)

A Vercel (plano gratuito) só publica commits feitos pela conta dona do projeto. Por isso, **em cada
PC**, dentro da pasta do projeto, rode uma vez:

```bash
git config user.name "operacionalos96-cpu"
git config user.email "335688876+operacionalos96-cpu@users.noreply.github.com"
```

Isso vale só para esta pasta. Todo merge na `main` publica sozinho. Ao juntar o PR pelo GitHub,
faça o merge logado na conta dona do projeto.
