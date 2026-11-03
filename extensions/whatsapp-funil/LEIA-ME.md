# Funil HZK — extensão do Chrome para o WhatsApp Web

Mostra, ao lado da conversa aberta no WhatsApp Web, o lead do Operacional OS e o próximo passo do funil
(texto, áudio ou vídeo). No modo manual escreve a mensagem na caixa e você aperta Enter.
Com o **agente** ligado, envia o funil e responde os leads sozinha (veja abaixo).

## Instalar (uma vez por computador)
1. No sistema: **Prospecção › Funil › Conectar extensão** → copie o token (aparece uma vez só).
2. Chrome → `chrome://extensions` → ligue **Modo do desenvolvedor** → **Carregar sem compactação** → escolha esta pasta (`extensions/whatsapp-funil`).
3. Clique no ícone da extensão → cole o token → **Salvar e testar**.
4. Abra/recarregue o WhatsApp Web.

## Como funciona
- Abriu uma conversa → acha o lead pelo número e mostra o passo do funil.
- **Escrever no WhatsApp** → coloca o texto na caixa. Quando você aperta Enter, o envio é registrado sozinho.
- Áudio como **mensagem de voz** (igual gravado na hora): clique em **Enviar como áudio gravado** e depois no microfone do WhatsApp. O áudio do funil entra no lugar da sua voz e é gravado em tempo real (1 min de áudio = 1 min). Quando terminar, clique em enviar. Seu microfone só é trocado nessa gravação.
- Áudio/vídeo como arquivo: suba o arquivo uma vez em **Prospecção › Funil › Editar funil** (o vídeo de diagnóstico é o personalizado do lead, depois de aprovado). Na conversa, **Anexar vídeo com a legenda** abre a prévia do WhatsApp com o arquivo e escreve o texto do passo na legenda; você clica em enviar e o passo é registrado sozinho.
- O link do arquivo vale 15 minutos; se passar disso, a extensão pede um novo sozinha.
- Quando o lead responde, a extensão percebe e libera o próximo passo (ou clique em **Ele já respondeu**).
- Aba **Hoje**: quem precisa do próximo passo hoje.
- **Alt + F** mostra ou esconde o painel. Ele segue o tema claro ou escuro do WhatsApp.

## Agente (envia sozinho)
Decisão e regras: `docs/adr/0018-agente-do-whatsapp.md`. Quem decide quem recebe, o quê e quando é o sistema;
a extensão só executa no WhatsApp Web deste computador.
- **Ligar:** a chave **Agente** no topo do painel liga neste computador. Ele também precisa estar ligado no
  sistema (limites, horário e base da oferta). Desligar a chave para tudo na hora.
- **O que ele faz, nesta ordem:** responde quem mandou mensagem → manda os follow-ups vencidos → manda
  aberturas para os leads da fila que têm celular (lê o site antes, se ainda não foi lido), até o limite do dia.
- **Respostas:** a IA lê a conversa e segue o roteiro, responde curto (só com o que está na base da oferta),
  tira do funil quem não quer ou passa para um humano. Áudio, foto ou vídeo do lead sempre vão para um humano.
- **Conversas:** para abrir a conversa de um lead, o WhatsApp Web recarrega no número. Conversas não lidas só são
  abertas se forem de um lead (pelo número ou nome igual); conversas pessoais ficam como estão.
- **Áudio:** tenta enviar como mensagem de voz. Se o Chrome não deixar tocar (página recém-aberta), vai como arquivo.
- **Não atrapalha você:** se houver texto na caixa ou um envio manual em andamento, ele espera.
- Deixe o WhatsApp Web aberto numa janela própria (aba em segundo plano faz o Chrome desacelerar a extensão).
- Precisa de um token novo (com o escopo `whatsapp:agent`): **Prospecção › Funil › Conectar extensão**.

O token tem os escopos `whatsapp:funnel` (achar lead pelo número e registrar envio/resposta) e `whatsapp:agent`
(próxima tarefa do agente e respostas da IA). Para desligar o token: **AI Office › Workers**.
