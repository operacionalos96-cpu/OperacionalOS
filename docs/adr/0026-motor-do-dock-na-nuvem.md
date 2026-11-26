# 0026. Motor do Dock na nuvem: OpenRouter com a chave da empresa, ligado por pessoa

- **Status:** Proposto
- **Data:** 2026-11-26

## Contexto

O motor do HZK Dock roda no app de PC (ADR 0022 e 0023). A chave de IA fica no cofre do Windows e
nunca vai ao servidor. Para usar um modelo open source, o caminho era o Ollama no próprio PC.

Fatos que pesaram:

- **O Igor não quer nada pesado no PC.** O Ollama deixa o PC lento, e o app precisa ficar aberto para o
  bot responder.
- **O site não tem como colar a chave nem parear o PC.** A ponte do app oferece essas funções
  (`window.opos.keys`, `opos.pc.beginPairing`), mas nenhuma tela as chama. Sem construir essas telas, o
  Dock não responde nem com o app instalado.
- **O motor já roda sem o Electron.** `desktop/src/engine` roda nos testes da raiz (`dock-pc.e2e.test.ts`).
- **O banco já separa por dono.** `claim_next_job` só entrega a um trabalhador o que é do mesmo dono, e
  `office_engine_job` confere lease, trabalhador ligado e mesmo dono em cada ferramenta (0028).
- **A chave do OpenRouter já está na Vercel** (`OPENROUTER_API_KEY`), colocada pelo Igor.
- **O OpenRouter aceita `provider.data_collection = "deny"`**: só manda para provedores que não guardam
  os dados ([documentação](https://openrouter.ai/docs/guides/routing/provider-selection)). Sem isso,
  alguns modelos grátis treinam com o conteúdo ([política de dados](https://openrouter.ai/docs/guides/privacy/provider-logging)).
- **Limites do grátis:** 50 pedidos por dia nos modelos `:free`, ou 1.000 depois de uma recarga única de
  US$ 10; 20 por minuto ([preços](https://openrouter.ai/pricing)). Uma resposta com ferramentas gasta
  vários pedidos.
- **A Vercel (Hobby) deixa uma função rodar até 300 s** ([limites](https://vercel.com/docs/limits)). O
  agendador do Supabase já chama `/api/runner/tick` a cada minuto e espera até 55 s (0012).

## Decisão

1. **Motor na nuvem por pessoa, ligado por ela.** Em Dock › PC, a pessoa liga "Motor na nuvem". O banco
   cria um trabalhador `kind = 'nuvem'` com dono (migration 0030), um por pessoa. Desligar vale na hora
   e devolve à fila o que ele segurava.
2. **Ele não tem token.** O hash é de um valor aleatório que ninguém recebe, e `authWorker` recusa
   `nuvem` mesmo se um token bater. Só o servidor o usa, por dentro (`src/lib/server/dock-cloud.ts`),
   chamando as mesmas ferramentas de `/api/workers` sem HTTP.
3. **As regras do banco não mudam.** Como o trabalhador tem dono, `claim_next_job` e `office_engine_job`
   valem como para o PC: a nuvem da Ana nunca pega nem age numa conversa do Gabriel.
4. **Uma chave da empresa para todos, só OpenRouter.** A chave sai da variável de ambiente direto para o
   cabeçalho; nunca vai ao banco, ao registro nem à IA. Toda chamada ao OpenRouter leva
   `provider.data_collection = "deny"` (também no app de PC). O OpenRouter fica classificado `padrao`
   em `dock_provider_policies`, com fonte e data.
5. **O mesmo motor, sem pastas.** O servidor usa `createEngine` do app de PC com `foldersFor = null`. Vale o
   nível do banco (até o teto da leva), mas sem pastas o nível 1 não dá ferramenta de arquivo. Só pega
   respostas (`office_reply`). Ação aprovada (`office_action`) continua com o PC, porque no servidor não
   há executor de conector.
6. **Roda no agendador.** `/api/runner/tick` chama o motor na nuvem e pega entregas novas até ~40 s depois
   do início. A entrega que já começou termina dentro dos 300 s. Se a função cair no meio, o lease vence
   e a entrega volta para a fila (`reap_expired_leases`).
7. **Aviso quando a pessoa precisa agir.** Bot com uma IA que a nuvem não usa (Ollama, Gemini…), sem
   modelo ou sem cota recebe um aviso na conversa e a entrega conclui, em vez de ficar tentando. Falha
   passageira do provedor volta para a fila.
8. **Lista de modelos vem do OpenRouter.** O servidor lê `GET /api/v1/models?supported_parameters=tools` e
   guarda nas conexões OpenRouter de quem usa a nuvem só os grátis que usam ferramentas. A lista fica em
   memória por 1 hora. Sem a lista, o bot deixa escrever o nome do modelo.

## Alternativas consideradas

- **Construir as telas de chave e pareamento do app de PC.** Rejeitada agora: continuaria exigindo o app
  aberto no PC, o que o Igor não quer. Continua valendo para quem quiser pastas (nível 1).
- **VPS (Hostinger KVM 4) com motor e Ollama.** Rejeitada por enquanto: é paga, e sem placa de vídeo só
  roda modelo pequeno e lento. Fica como caminho se o volume crescer.
- **Um trabalhador da empresa (sem dono) que pega as entregas de todos.** Rejeitada: teria de mudar
  `claim_next_job` e `office_engine_job`, e a regra "só o dono" deixaria de ser do banco.
- **Chave por pessoa no servidor.** Mais justo no limite e no custo, mas guardaria as chaves de todos num
  lugar só (o risco que a ADR 0023 rejeitou). Pode vir depois, no cofre do Supabase.
- **Rota própria com agendador novo.** Rejeitada: pediria outro `cron.schedule` no Supabase. O tick que
  já existe basta.

## Consequências

- **Mais fácil:** o bot responde sem nada no PC. Ligar e desligar é da pessoa.
- **Mais difícil:** sem pastas no PC. Ações de conector continuam sem executor (fatia 6).
- **Exceção às ADRs 0022 e 0023:** para quem liga a nuvem, a conversa com o bot passa pelo servidor da
  HZK (nada é guardado além do que o Dock já guarda), e uma chave de IA fica no servidor. A tela diz isso
  antes de ligar.
- **Riscos aceitos:**
  - a cota grátis é dividida pelo time: 50 pedidos por dia acaba rápido (a tela avisa);
  - a resposta pode levar até ~1 minuto para começar (o agendador roda a cada minuto);
  - o plano Hobby da Vercel é para uso pessoal ou não comercial ([termos](https://vercel.com/legal/terms)),
    o que já vale para o app inteiro;
  - a classificação `padrao` do OpenRouter foi posta pelo sistema; um founder confirma ou troca.
- **Testes:** `src/lib/server/dock-cloud.e2e.test.ts` roda a 0030 no Postgres de teste com o motor de
  verdade e um OpenRouter falso: ligar, responder, não pegar a conversa de outro dono, avisar, sem cota e
  desligar.
- **Depois:** chamar o motor na hora em que a mensagem chega (sem esperar o minuto); chave por pessoa;
  founder poder desligar a nuvem de alguém.
