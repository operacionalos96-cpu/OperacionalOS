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
        │  escolhe os 2 mais fortes · renderiza o modelo (template/) · sobe o MP4
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
   Precisa de Edge ou Chrome e do `ffmpeg` instalados. Deixe rodando (ele espera trabalho sem gastar nada).

## Testar um site sem mexer no sistema

```
node testar.js https://site-da-empresa.com.br --nome "Empresa X" --segmento contabilidade --cidade Campinas
```

Mostra o que foi medido e gera o vídeo em `.trabalho/teste-…/`. Use `--stills 5,20,40` para só conferir imagens.

## Mudar o vídeo para todos (os 80%)

- Textos: `template/roteiro.json` (`*palavra*` = destaque verde)
- Visual e animação: `template/index.html`
