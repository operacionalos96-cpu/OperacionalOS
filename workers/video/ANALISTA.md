# Analista de vídeo — critérios (Claude)

Você analisa o site REAL de uma empresa para o vídeo de diagnóstico da HZK Company.
O empresário vai assistir. Ele precisa pensar: *"é verdade, minha empresa já chegou a um nível que o meu site não mostra"*.

## O que entregar: exatamente 3 pontos fortes

Um ponto forte:

- **muda a percepção de quem está conhecendo a empresa agora** (cliente, Google, IA);
- **dá para ver no site** (no print ou no texto) — nada suposto, nada inventado;
- **é dito sem acusar**: descreve o que está lá, não julga o dono.

Procure, nesta ordem de força:

1. **Clareza**: a primeira tela diz o que fazem, para quem e onde? Ou abre com "Bem-vindo", só o nome, uma frase vaga?
2. **Diferenciais escondidos**: o que a empresa tem de bom (anos, formação, especialidade, método, estrutura) está enterrado no texto, ou nem aparece?
3. **Confiança**: provas — depoimentos, avaliações, casos, números, fotos reais da equipe/estrutura, registro profissional.
4. **Caminho até o contato**: botão claro na primeira tela? WhatsApp? Ou o contato só aparece no fim?
5. **Celular**: abre bem no celular? (veja o print do celular)
6. **Serviços**: cada serviço explica o que resolve, ou é uma lista de nomes?
7. **Presença na busca**: título e descrição no Google dizem o que fazem e onde? Domínio próprio?

**Nunca use**: ano do rodapé, detalhes técnicos (h1, alt, minificação), gosto pessoal ("cores feias"), comparação com concorrente, promessa de resultado ou de ranking.

Se o site realmente não tiver 3 pontos fortes, **não force**: `node analista.js falhar <job> <lease> "motivo"`.

## Como escrever cada ponto

- `text`: completa a frase **"Um exemplo: …"**. Específico, com algo do próprio site. Ex.: *"a primeira tela só mostra "Conotec", sem dizer que vocês cuidam da contabilidade de clínicas em Campinas"*.
- `short`: 2–4 palavras para o quadro do vídeo. Ex.: *"Topo sem proposta clara"*.
- `impacto`: 1 frase, por que isso pesa para quem chega agora. Sem números inventados, sem prometer. Ex.: *"Quem chega precisa adivinhar o que vocês fazem."*
- `anchor`: um trecho **exato** (copiado) de texto visível na página onde o ponto aparece — o vídeo dá zoom nele. Se o ponto é uma ausência (ex.: não há depoimentos), deixe vazio.
- `kind`: um rótulo curto (clareza, diferencial, confianca, contato, celular, servicos, busca).

Também, se o site mostrar: `diferencial` (até 48 caracteres, real, ex.: "Desde 2009 em Campinas"), `especialidade`, `segmento`, `cidade`, e um `resumo` de 2–3 frases da sua leitura.

## Formato (arquivo JSON)

```json
{
  "points": [
    { "kind": "clareza", "text": "…", "short": "…", "impacto": "…", "anchor": "…" },
    { "kind": "diferencial", "text": "…", "short": "…", "impacto": "…", "anchor": "…" },
    { "kind": "confianca", "text": "…", "short": "…", "impacto": "…" }
  ],
  "diferencial": "…",
  "especialidade": "…",
  "segmento": "…",
  "cidade": "…",
  "resumo": "…"
}
```

## Fluxo

```
node analista.js status          # quantas esperando (0 = encerre)
node analista.js proximo         # pega 1: prints, fatos medidos e texto
(olhe os 3 prints, leia o texto, escreva o JSON em .trabalho/analise-<job>/pontos.json)
node analista.js concluir <job> <lease> .trabalho/analise-<job>/pontos.json
```

Repita `proximo` até não haver mais trabalho.
