# Worker de vídeo (Video Studio)

Gera o **vídeo de análise personalizado** de cada lead — mas **só de quem chega nessa parte do funil**.

## Como funciona

```
lead aceita o áudio (respondeu ao passo antes do vídeo) ou o áudio foi enviado
        │  (gatilho no banco — SQL 0013, mesma regra de src/lib/domain/prospect-video.ts)
        ▼
job render_prospect_video (1 por lead) ──► este worker (na máquina de vocês)
        │  abre o site REAL · print desktop, página inteira e celular
        │  mede problemas que dá para provar (com a área exata na página)
        │  3 pontos (análise do Claude) · renderiza o modelo DX-001 (dx/) · sobe o MP4
        ▼
lead.video = "Pronto para revisar"  →  Pipeline › lead › Vídeo de análise › Assistir › Aprovar
        ▼
extensão do WhatsApp anexa o vídeo DESTE lead no passo "Vídeo" do funil
```

Leads que não chegam nessa etapa nunca gastam render. Sem nenhum problema comprovável no site,
o job falha de propósito ("não inventamos") e o funil usa o vídeo padrão.

## O que ele mede (só o que dá para provar)

| Achado | Evidência |
| --- | --- |
| Rodapé com ano antigo | texto "© 2019…" no rodapé |
| Não adaptado ao celular | em 390 px a página fica mais larga que a tela |
| Contato só no fim | primeiro telefone/WhatsApp depois de ~2 telas de rolagem (sem botão flutuante) |
| Serviços sem explicação | seção "Serviços/Tratamentos…" com só nomes, sem descrição |
| Topo sem proposta clara | maior texto da 1ª tela é "Bem-vindo…" ou 1–2 palavras |
| Sem botão de WhatsApp | nenhum link de WhatsApp na página |
| Site sem https | abre em http:// |
| Sem depoimentos | nenhuma menção a depoimentos/avaliações |

O diferencial do vídeo também vem do texto do site ("desde 2009", "mais de 15 anos de experiência", "hora marcada"…); sem isso, a cena se adapta.

## Ligar

1. **Banco:** rode `supabase/migrations/0013_video_prospeccao.sql` no SQL Editor (uma vez).
2. **Token:** AI Office › Workers › Novo worker — agente **Video Studio**, capability **video_render**, escopos `queue:read`, `jobs:claim`, `jobs:execute`, `context:read`. Copie o token (aparece 1 vez).
3. **Nesta pasta:**
   ```
   npm install
   copy .env.example .env      (cole o token em OOS_WORKER_TOKEN)
   npm start
   ```
   Precisa de Edge ou Chrome instalado. Deixe rodando (ele espera trabalho sem gastar nada).
4. **Modelo do vídeo (DX-001), uma vez:** `cd dx` e `npm ci`. O primeiro render baixa o navegador do Remotion (precisa de internet).
   O Remotion é grátis para empresas com até 3 pessoas; acima disso, é pago (remotion.dev/license).

## Testar um site sem mexer no sistema

```
node testar.js https://site-da-empresa.com.br --nome "Empresa X" --segmento contabilidade --cidade Campinas
```

Mostra o que foi medido e gera o vídeo em `.trabalho/teste-…/` (cerca de 4 min; `--escala 0.5` faz uma prévia mais rápida).

## O vídeo: modelo DX-001 (70% fixo, 30% do lead)

O funil tem um vídeo só, o de diagnóstico. Ele é o modelo DX-001 em `dx/` (Remotion). Narração, 3D, sons e tempos (112,6 s, v3.2) são fixos e iguais para todo lead;
cada lead só troca os prints, o nome, o endereço e os 3 pontos na tela. O worker grava o `dados.json` na pasta de trabalho
(ao lado de `home.png`, `pagina.png` e `mobile.png`) e chama `dx/gerar_video.mjs`. O contrato completo está em `dx/LEIA-ME.md`.

- Limites por ponto: `short` até 48 caracteres, `text` até 220, `impacto` até 180 (os mesmos que o servidor aplica na análise).
- Lead rejeitado pelo modelo (ex.: faltou um print) vira falha sem nova tentativa; falha do render tenta mais uma vez.
- O render usa metade dos núcleos do PC: com 8 abas em paralelo num PC de 8 núcleos ele falhava de vez em quando.
  Para mudar: `node dx/gerar_video.mjs <pasta> <saida.mp4> --concorrencia=4`.
- Roteiro, narração ou 3D novos vêm do estúdio da HZK como um pacote novo: substitua `dx/` inteiro, mantendo esta seção em dia.
