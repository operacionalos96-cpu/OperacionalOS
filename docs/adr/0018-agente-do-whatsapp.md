# 0018. Agente do WhatsApp: a extensão envia o funil e responde com IA

- **Status:** Aceito
- **Data:** 2026-11-03

## Contexto

Até aqui o envio no WhatsApp era sempre humano: a extensão escrevia a mensagem e a pessoa apertava Enter.
O volume da prospecção ficava preso ao tempo de alguém na frente do WhatsApp Web. A decisão foi não usar a
API oficial da Meta e não disfarçar o agente de pessoa: um agente de IA opera o WhatsApp Web do próprio PC,
às claras.

## Decisão

1. **Quem decide é o servidor; a extensão executa.** A extensão pergunta "o que faço agora?" (`agent_agenda`),
   faz no WhatsApp Web e registra. As regras ficam em `src/lib/domain/whatsapp-agent.ts`:
   - **Ordem:** quem respondeu vem sempre primeiro, com intervalo próprio e curto (padrão 1–3 min). Sem
     resposta pendente, alterna abertura nova e follow-up vencido.
   - **Aberturas:** a mesma fila da Prospecção (`prospectQueue`), com celular válido. Sem corte de nota
     (a maioria dos leads ainda não tem nota). Site não lido não impede: o agente lê o site antes de enviar.
     O agente aprova o lead em nome dele (`approvedBy: "whatsapp-agent"`), sem misturar com as decisões
     humanas que servem de aprendizado.
   - **Só nas conversas dele:** respostas e follow-ups apenas em leads que o agente já tocou; as conversas
     feitas à mão antes dele continuam com o humano.
   - **Limites:** conversas novas por dia (padrão 10, para o piloto), envios por dia (60), janela em
     Brasília (seg–sex, 9h–18h) e intervalo sorteado entre 3 e 8 min. O intervalo é estável para o mesmo envio.
2. **Respostas com IA (Gemini, `agent_reply`)**, sempre validadas por `parseAgentReply`:
   - Uma das quatro ações: seguir o roteiro, responder livre (até 700 caracteres), parar ou chamar um humano.
   - **Pedido para parar** é decidido sem IA (`isOptOut`).
   - **Áudio, imagem ou vídeo do lead** vão para um humano, porque a IA não ouve nem vê.
   - **Só pode afirmar o que está na base da oferta.** Link fora dela vira "humano".
   - **Se perguntarem, diz que é IA.** A conversa é tratada como dado, nunca como instrução.
3. **Humano assume:** `lead.agent.needsHuman` tira o lead do agente até alguém devolvê-lo (`agent.release`).
   Quem responde depois do fim do funil também é conversa de humano.
4. **Configuração** em `ai_settings` (`whatsapp_agent`), sem migration. Começa **desligado**.
   O token da extensão ganha o escopo `whatsapp:agent`; tokens antigos continuam só no modo manual.

## Consequências

- **Risco assumido:** automação fora da API oficial pode levar o WhatsApp a banir o número. Os limites
  existem para o agente se comportar como um remetente bom, não para esconder nada.
- O PC precisa ficar ligado com o Chrome e o WhatsApp Web abertos enquanto o agente trabalha.
- **Envios do agente** entram como `lead.contacted`/`lead.followup_sent` com `agent: true`, então o vídeo
  personalizado e o histórico do lead continuam funcionando igual.
- **Próximas etapas:** o ciclo do agente na extensão, o painel (ligar, limites, base da oferta, "Precisa de
  humano") e o piloto com poucas conversas novas por dia.
- **Teste:** `whatsapp-agent.test.ts`.
