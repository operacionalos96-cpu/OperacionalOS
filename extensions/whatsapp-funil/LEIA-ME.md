# Funil Operacional OS — extensão do Chrome para o WhatsApp Web

Mostra, ao lado da conversa aberta no WhatsApp Web, o lead do Operacional OS e o próximo passo do funil
(texto, áudio ou vídeo). **Nunca envia nada sozinha**: escreve a mensagem na caixa e você aperta Enter.

## Instalar (uma vez por computador)
1. No sistema: **Prospecção › Funil › Conectar extensão** → copie o token (aparece uma vez só).
2. Chrome → `chrome://extensions` → ligue **Modo do desenvolvedor** → **Carregar sem compactação** → escolha esta pasta (`extensions/whatsapp-funil`).
3. Clique no ícone da extensão → cole o token → **Salvar e testar**.
4. Abra/recarregue o WhatsApp Web.

## Como funciona
- Abriu uma conversa → acha o lead pelo número e mostra o passo do funil.
- **Escrever no WhatsApp** → coloca o texto na caixa. Quando você aperta Enter, o envio é registrado sozinho.
- Áudio/vídeo → suba o arquivo uma vez em **Prospecção › Funil › Editar funil**. Na conversa, **Anexar áudio/vídeo** abre a prévia do WhatsApp com o arquivo; você clica em enviar e o passo é registrado sozinho.
- Quando o lead responde, a extensão percebe e libera o próximo passo (ou clique em **Ele respondeu**).
- Aba **Hoje**: quem precisa do próximo passo hoje.

O token só tem o escopo `whatsapp:funnel` (achar lead pelo número e registrar envio/resposta). Para desligar: **AI Office › Workers**.
