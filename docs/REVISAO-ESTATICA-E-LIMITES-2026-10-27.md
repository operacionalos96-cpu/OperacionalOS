# Revisão estática complementar — 27/10/2026

## Alterações seguras feitas

- Adicionado `.env.example` com os nomes das variáveis de ambiente encontradas no código e comentários para configuração local. O arquivo contém apenas valores de exemplo/vazios; não contém segredos reais.
- Mantidos sem reformulação os módulos Navegação, Busca, Metas e Cofre, conforme a restrição de escopo.
- Nenhuma migração foi executada, nenhuma chamada a serviço externo foi feita e nenhum dado real foi alterado.

## Achados que exigem validação ou correção antes de produção

### 1. Destino de webhook de saída e SSRF — **RESOLVIDO em 29/10/2026** (ver CORRECOES-2026-10-29.md)

`src/lib/server/webhooks.ts` valida HTTPS, credenciais embutidas, parâmetros com nomes semelhantes a segredo e `localhost`/`127.0.0.1`, mas não há bloqueio explícito de IPs privados/reservados (por exemplo, redes privadas e endereços link-local) nem validação do DNS resolvido. O serviço de entrega usa `fetch(d.endpoint, ...)`. Como o destino é configurável, isso pode permitir requisições do servidor a endereços internos se um usuário autorizado cadastrar um destino malicioso.

**Status:** achado estático, não explorado. Não foi feita uma correção parcial porque uma defesa robusta precisa considerar DNS e rebinding, além de IPv4/IPv6. Antes de produção, validar/resolver o destino para endereços públicos e impedir que a conexão use um endereço privado/reservado; adicionar testes para IPs locais, IPv6, hostname interno e DNS que resolva para endereço privado.

### 2. Rotas públicas no middleware

`src/middleware.ts` exclui do login algumas rotas de API para permitir chamadas externas. Isso é aceitável apenas quando cada endpoint valida sua autenticação própria. A inspeção encontrou verificações explícitas em rotas de workers, MCP, runner, sincronização e webhooks; ainda é necessário testar cada caminho HTTP e cada método em staging, inclusive ausência de segredo, segredo inválido, segredo válido e rate limiting.

**Status:** revisão estática parcial; testes de integração não executados.

### 3. Operações privilegiadas do AI Office

`src/app/api/ai-office/[action]/route.ts` chama `requireMember()` e depois usa o cliente Supabase privilegiado para executar mutações por ID. O código não verifica um nível de cargo nessa rota. A política de produto atual pode intencionalmente permitir que todos os membros operem o AI Office; isso precisa ser confirmado explicitamente, pois as ações incluem criar/rotacionar tokens, remover webhooks, alterar configuração e iniciar jobs.

**Status:** decisão de autorização a confirmar; não alterado sem regra de negócio aprovada.

## Limitações da execução automatizada

O `npm ci` desta sessão não terminou dentro do limite disponível e deixou `node_modules` incompleto. Por isso, ESLint, Vitest, Next build e TypeScript não puderam ser executados de modo válido. Os erros de binários/tipos ausentes não são evidência suficiente de falha do código-fonte.

Para fechar a validação, em ambiente com acesso ao registry npm, executar:

1. `npm ci --no-audit --no-fund`
2. `npm run lint`
3. `npx tsc --noEmit`
4. `npm test`
5. `npm run build`
6. Testes de integração em staging Supabase/Vercel, com contas e dados fictícios.

## Escopo não realizado

- Não foram testadas credenciais reais, RLS efetiva no projeto Supabase, callbacks OAuth, cron da Vercel, notificações externas, browser nem workers reais.
- Não foram executadas migrações SQL nem webhooks reais.
- Não foram reformulados os módulos Navegação, Busca, Metas ou Cofre.
