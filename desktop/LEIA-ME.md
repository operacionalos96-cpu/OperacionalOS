# App do OperacionalOS para Windows (HZK Dock no PC)

Fatias 3, 4 e 5 da nota 32 do vault ("Encaixe do Dock v3"). Desenho: notas 26, 27 e 42 (F5.2 e F5.3).

```
desktop/
├── src/main.ts       janela travada, ponte window.opos, motor, tema, atualização, autoteste
├── src/preload.ts    a ponte (contextBridge), só funções; nenhum segredo sai por ela
├── src/preload-abertura.ts  ponte mínima da abertura (window.oposAbertura): só recebe o estado
├── src/abertura-estado.ts   regras da abertura sem Electron (PC aguardando x desligado, mínimo na tela)
├── abertura/         tela de abertura (index.html, abertura.css, abertura.js), modo limitado (offline.*) e ícones (icone.png, icone.ico)
├── bolinha/          a bolinha da área de trabalho (index.html, bolinha.css, bolinha.js)
├── src/preload-bolinha.ts   ponte mínima da bolinha (window.oposBolinha): recebe o estado, envia só avisos sem dados
├── src/bolinha-regras.ts    regras da bolinha sem Electron (posição dentro do monitor, quando mostrar, clique x arraste)
├── build/            ícone: icon.svg (fonte), icon-24.svg e icon-16.svg (tamanhos pequenos), gerar-icone.mjs e as saídas
├── src/settings.ts   configuração local: tema, pastas e nível confirmado por bot, endereço confirmado
└── src/engine/       o motor (sem Electron: roda nos testes da raiz)
    ├── client.ts     /api/workers/<ferramenta> com o token oos_ do PC (401 = PC desligado: para)
    ├── engine.ts     laço da entrega, reservas, skills, pastas, porteiro, ação aprovada, Parar tudo
    ├── providers.ts  compatível com OpenAI (Ollama, LM Studio, OpenRouter, xAI, DeepSeek, Mistral, Kimi, Inception, personalizado) e Anthropic nativo
    ├── folders.ts    nível 1: caminho conferido pelo motor (.., junção, atalho, rede, dispositivo, fluxo)
    └── vault.ts      cofre cifrado (DPAPI pelo safeStorage) e redação do registro
```

## Comandos

```bash
cd desktop
npm install
npm run start          # abre o app (fora do pacote, OPOS_URL troca o endereço)
OPOS_UPDATE_URL=https://<pasta de atualizações>/ npm run dist   # instalador NSIS por usuário em release/
```

Testes: na raiz, `npx vitest run` roda também os do motor (`desktop/src/**/*.test.ts`) e o ponta a ponta
(`src/lib/server/dock-pc.e2e.test.ts`).

Autoteste do app empacotado: `release/win-unpacked/OperacionalOS.exe --autoteste [--autoteste-atualizacao]`
grava `%APPDATA%/OperacionalOS/autoteste.json` (travas vistas de dentro da página, tema, atualização e as fases
da abertura em `abertura.fases`), `autoteste.png` (retrato da janela) e `autoteste-abertura.png` (retrato da
abertura no "Pronto") e fecha. Fora do pacote também roda: `OPOS_URL=http://localhost:3040 npx electron . --autoteste`.
Com `--autoteste-bolinha`, o relatório ganha `bolinha` (liga pela ponte, minimiza, confere que ela aparece, retrata
os quatro estados em `autoteste-bolinha-<estado>.png`, clica nela, desliga pela ponte e confere que não aparece mais).

## Tela de abertura (nota 39, Parte A)

Janela sem moldura de 480 × 300, centralizada, aberta antes da principal. Arquivos locais em `abertura/`
(sem CDN, sem fonte remota, CSP só `'self'`). Visual Órbita: fundo grafite fosco (ou mineral no tema claro, pelo
tema salvo em Configurações ou o do Windows), esfera navy com o símbolo, três nós em órbitas finas. Cada etapa
concluída encaixa um nó na diagonal do Z; no fim a linha se desenha atrás da esfera e o laranja acende uma vez.
"Reduzir movimento" do Windows: nós já alinhados, só texto e cor mudam. Sem som.

| Fase | Quando | O que faz |
|---|---|---|
| `conferindo` / `baixando` | etapa 1 | electron-updater (só no pacote): conferir até 8 s; se houver versão nova, barra de progresso por até 20 s, depois continua baixando por trás e instala ao reiniciar. Falhou: segue |
| `pc` | etapa 2 | lê `get_worker_config` com o token do PC (6 s). Sem token: abre para parear |
| `pc-aguardando` | 401 e o PC nunca foi aceito | mostra o nome do PC e o código curto (a mesma dica de 4 caracteres que o founder vê), abre o app depois de ~3 s e confere a cada minuto; quando aprovar, liga o motor |
| `pc-desligado` | 401 depois de já ter sido aceito | **não abre o app**. "Fechar" sai; "Pedir liberação de novo" pede confirmação nativa, apaga a credencial e abre o app para novo pedido |
| `motor` | etapa 3 | liga o motor (se o PC está liberado) e avisa as IAs locais que responderem (Ollama 11434, LM Studio 1234) |
| `pronto` / `offline` | etapa 4 | espera o site carregar (até 12 s), cumpre o mínimo de 1,2 s, alinha no Z e mostra a principal com esmaecer de ~220 ms |

O servidor responde 401 igual para "pedido" e "desligado"; a diferença fica neste PC (`pcSeenApproved` em
`configuracao.json`, marcado quando o servidor aceita o PC e zerado ao esquecer o PC).
Sem internet: aviso "modo limitado" e, se o site não carregar, a janela principal mostra `abertura/offline.html`
("Tentar de novo" volta ao endereço do OperacionalOS; tenta sozinha a cada 30 s).

Ponte da abertura (`src/preload-abertura.ts`): `oposAbertura.aoMudar(cb)` recebe o estado; `oposAbertura.escolher(v)`
só aceita `"fechar"` ou `"pedir-de-novo"` e o processo principal só ouve a própria janela da abertura.

**Prévia no navegador** (sem Electron): sirva `desktop/abertura/` (no OperacionalOS: `preview_start` "abertura",
porta 3041) e abra `index.html?estado=conferindo|baixando|pc|pc-aguardando|pc-desligado|motor|pronto|offline&tema=claro|escuro`.
Extras: `&progresso=42`, `&pc=Nome`, `&codigo=K7q2`, `&ias=Ollama,LM%20Studio`, `&versao=0.1.0`, `&movimento=reduzido`.
Sem `?estado`, a sequência real roda em laço.

## Bandeja do Windows

Fechar a janela principal com o motor ligado (esperando ou trabalhando) não fecha o app: a janela some e o ícone
fica na bandeja (aviso uma vez só). Menu: **Abrir**, **Parar tudo** (devolve a entrega à fila; com a janela
escondida, o app fecha de vez), **Bolinha na área de trabalho** (marcável) e **Sair**. Clique no ícone abre a janela. Se o motor parar ou o PC for desligado
com a janela escondida, o app fecha. Sem motor ligado, fechar a janela fecha o app como antes.

## Ponte `window.opos` (para a tela "Configurações do PC", fatia 2c)

Só existe dentro do app. No navegador comum, `window.opos` é `undefined`: a tela mostra "disponível no app".
O processo principal só responde ao quadro principal da janela, na origem do OperacionalOS.

| Função | O que faz |
|---|---|
| `opos.version()` | versão do app, do Electron e o teto de nível (1) |
| `opos.theme.get()` / `opos.theme.set("claro" \| "escuro" \| "sistema")` | a janela do Windows acompanha o tema do site |
| `opos.pc.beginPairing(nome)` | confirma na janela nativa, cria a credencial no cofre e devolve `{ name, token_hash, token_hint }`. **A tela chama `rpc("office_request_pc", { p_name, p_token_hash, p_token_hint })`** com a sessão da pessoa; um founder aprova com `dock_decide_pc` |
| `opos.pc.status()` / `start()` / `stopAll()` / `forget()` | estado do motor; ligar; **Parar tudo** (devolve a entrega à fila); esquecer o PC |
| `opos.folders.list(agentId)` / `add(agentId, nomeDoBot)` / `remove(agentId, caminho)` | pastas liberadas por bot; `add` abre o seletor do Windows e pede confirmação nativa; unidade inteira, Windows, Programas, a pasta do usuário inteira e a do app são recusadas |
| `opos.level.get(agentId)` / `confirm(agentId, 0 \| 1, nomeDoBot)` | nível confirmado NESTE PC. Vale o menor entre este, o do banco e 1 |
| `opos.keys.save(connectionId, provider, chave, endpoint?)` / `has(...)` / `remove(...)` | chave de IA no cofre do Windows, presa ao endereço (confirmação nativa). Nunca volta para a página |
| `opos.log.open()` | abre a pasta do registro local |
| `opos.onEngineState(cb)` | `parado`, `esperando`, `trabalhando`, `desligado`, `erro` |
| `opos.float.get()` / `opos.float.set(enabled: boolean)` | bolinha na área de trabalho: as duas devolvem `{ enabled }`; `set` recusa o que não for booleano. Interruptor em Dock › PC |

## Bolinha na área de trabalho

Com a opção ligada (padrão na primeira vez), minimizar a janela ou mandá-la para a bandeja faz aparecer uma janela
de 72 × 72 sem moldura, transparente, sempre no topo, fora da barra de tarefas e que não rouba o foco: a esfera da
Órbita com o símbolo HZK e uma órbita com um nó. Movimento pelo estado do motor: **parado** quieta; **esperando**
órbita lenta; **trabalhando** órbita girando com o nó laranja; **erro** ou **PC desligado** o ponto laranja acende e
pulsa. "Reduzir movimento" do Windows: nada gira nem pulsa, só a cor muda. A dica (passar o mouse) diz o estado.

- **Clique** (sem arrastar): restaura e foca a janela principal; a bolinha some. Voltar à janela por qualquer outro
  caminho (barra de tarefas, bandeja, Alt+Tab) também a esconde.
- **Arrastar**: leva para qualquer lugar; a posição fica em `configuracao.json` (`float.x`, `float.y`). Ao reaparecer,
  ela é conferida contra os monitores ligados: se o monitor sumiu, volta ao canto inferior direito do principal;
  se ficou meio para fora, é empurrada para dentro da área de trabalho.
- **Botão direito**: **Abrir**, **Parar tudo** (só com o motor ligado) e **Esconder a bolinha** (desliga a opção).
  Enquanto o menu está aberto a bolinha fica focável (sem isso o Windows não fecha o menu com clique fora).
- **Onde desligar**: interruptor em Dock › PC (pela ponte `opos.float`), item marcável no menu da bandeja e
  "Esconder a bolinha" no próprio menu dela.
- **Segurança**: carrega só `bolinha/index.html` do pacote, CSP `'self'`, sandbox, sem nodeIntegration, sessão própria
  em memória. A ponte `window.oposBolinha` recebe o estado e envia só avisos fixos sem dados (`apertou`, `moveu`,
  `soltou`, `cancelou`, `menu`); quem lê o mouse e move a janela é o processo principal, que só ouve a própria bolinha.

Prévia sem Electron: abrir `bolinha/index.html?visual=quieta|lenta|girando|alerta`.

## Ícone

Fonte em `build/icon.svg` (esfera da Órbita com aro claro para a barra de tarefas escura, o Z da HZK, a linha e os
três nós laranja, traçado igual ao `public/hzk-simbolo.svg`). Nos tamanhos pequenos o desenho é outro, na grade
inteira: `build/icon-24.svg` (barra de tarefas a 100%) e `build/icon-16.svg` (bandeja; também 20 e 32), só esfera,
Z grosso e o nó laranja no alto do traço. Para gerar de novo (usa o `sharp` da raiz, sem dependência nova):

```bash
node desktop/build/gerar-icone.mjs
```

Saídas: `build/icon.png` (1024), `build/icon.ico` (16 a 256, usado pelo electron-builder), `abertura/icone.png` e
`abertura/icone.ico` (janela principal, abertura, bandeja e bolinha), e no site `src/app/icon.svg` (o de 16),
`favicon.ico` (16, 32, 48) e `apple-icon.png` (180, fundo cheio). Folha de prova: `build/prova-icone.png` (todos os
tamanhos sobre barra clara, barra escura e papel de parede azul, com os pequenos ampliados pixel a pixel).

## Banco e servidor (já neste branch)

- Migration `0028_dock_pc.sql`: `office_request_pc`, `dock_decide_pc`, `office_disable_pc` (pessoa logada);
  `office_delivery`, `office_engine_check`, `office_skill_package`, `office_report_connection`, `office_record_usage`
  (só servidor); `claim_next_job` respeita escritório suspenso e bot pausado.
- Ferramentas do motor (`src/lib/server/dock-engine.ts`) nas rotas que já existem (`/api/workers`, `/api/mcp`),
  escopo `office:engine`, só para PC liberado.

## Limites desta versão (de propósito)

- Níveis 2 e 3, programas ACP e skills com script **não existem** (decisão de 14/11/2026: esperam a área isolada do Windows).
- Conector da empresa: o ponto de chamada do porteiro (`office_request_action`) está pronto, mas nenhum executor
  vem registrado: ação sem executor não é oferecida à IA. Os executores entram com a fatia 6.
- Sem certificado de assinatura (nota 27). Com o **Controle de Aplicativo Inteligente** do Windows ligado, o
  instalador não assinado é bloqueado. Comprar o certificado antes de distribuir.
- A pasta de atualizações (`OPOS_UPDATE_URL`) ainda não existe. A nota 27 recomenda um bucket do Supabase;
  um bucket privado pede um cabeçalho de acesso no electron-updater (a decidir).
- Electron 45.2.1: subir para o patch mais novo antes de publicar (correções de segurança saem nas versões novas).
