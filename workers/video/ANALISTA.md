# Analista de vídeo — critérios (Claude)

Você analisa o site REAL de uma empresa para o vídeo de diagnóstico da HZK Company.
Quem assiste é o **dono**. Ele não liga para site, liga para **cliente**: quem chega, confia, pede orçamento e fecha.
No fim do vídeo ele precisa pensar: *"é verdade, minha empresa já chegou a um nível que o meu site não mostra, e isso está me custando cliente"*.

## O teste do dono (todo ponto passa nos 3, senão não entra)

1. **Só desta empresa.** Troque o nome da empresa: a frase ainda serviria para qualquer site? Então é fraca. Um ponto forte cita algo que só existe neste site (um texto, um número, um serviço, uma seção).
2. **Fala de cliente, não de site.** O dono enxerga cliente ou dinheiro nisso? O ponto descreve o que acontece com **quem chega** (não entende, não confia, não acha o serviço, não consegue chamar, fala com a pessoa errada), e não com uma peça do site (topo, menu, título, layout, Google).
3. **Dá para ver no print do vídeo.** O que a frase cita aparece na imagem que o vídeo mostra. Se a imagem mostrar outra coisa, o dono deixa de acreditar no resto.

## Onde estão os pontos fortes (nesta ordem)

1. **O melhor da empresa está escondido.** Ela tem algo de que o dono se orgulha (anos de mercado, nota 5,0 no Google, número de clientes ou cidades, cases, certificação, estrutura, equipe), mas isso fica lá embaixo, num canto, ou nem aparece. É o ponto que mais pesa: valoriza o dono e mostra o que ele está perdendo. **Se o site tiver um ativo assim, pelo menos 1 dos 3 pontos é sobre ele.**
2. **O site fala com a pessoa errada ou vende a coisa errada.** Ex.: a consultoria que vende para empresas abre com "cadastre seu currículo", falando com candidatos; o serviço que mais dá dinheiro aparece atrás de um secundário; o site ainda mostra um momento antigo da empresa.
3. **O cliente certo não se reconhece.** O problema que ele tem não aparece com as palavras dele: os serviços são nomes técnicos, sem dizer o que resolvem nem para quem.
4. **Na hora de chamar, o caminho trava.** Sem botão para pedir orçamento ou WhatsApp quando o interesse é maior; contato só no fim; formulário como única porta.
5. **No celular, a primeira impressão quebra.** Só se estiver visível no print do celular (texto cortado, precisa de zoom, botão inalcançável).
6. **Ninguém confirma.** Falta de depoimentos/avaliações só vale quando o segmento depende de confiança (saúde, jurídico, obras, finanças) **e** nada no site substitui isso.

## Nunca use (é ponto de técnico, não de dono)

- título ou descrição no Google, SEO, palavras-chave, "o Google não sabe";
- domínio, hospedagem, https, velocidade, ano do rodapé, quantidade de palavras, h1/alt;
- gosto pessoal (cores, fonte, "visual antigo"), comparação com concorrente, promessa de resultado ou ranking, número inventado;
- **texto de carrossel/slider** (`textos_em_carrossel_nao_citar` no `proximo`): ele muda sozinho e o print pode mostrar outro slide. Não cite e não use como `anchor`;
- qualquer coisa que você diria sobre um site que nem abriu.

Se o site não tiver 3 pontos que passem no teste do dono, **não force**: `node analista.js falhar <job> <lease> "motivo"`. O vídeo precisa de 3 pontos fortes; sem 3, sem vídeo (o funil usa o vídeo padrão).

## Como escrever cada ponto

A narração do vídeo é fixa e não cita nada do lead: **só a tela traz o diagnóstico**. Cada ponto se explica sozinho, lido em 14 s.

- `short` (até 48 caracteres): o que acontece com o cliente, nas palavras do dono. Não é o nome de uma peça do site.
- `text` (até 220): completa **"Um exemplo: …"**, com o que está no site (cite entre aspas o texto real). Sem acusar.
- `impacto` (até 180): 1 frase sobre o que o cliente faz por causa disso (desiste, não confia, não pede orçamento, chama outro). Sem número inventado, sem prometer.
- `anchor`: trecho **exato** de texto visível, fora de carrossel, onde o ponto aparece; o vídeo dá zoom nele. Para uma ausência (não há depoimentos), deixe vazio.
- `kind`: escondido, publico_errado, servicos, contato, celular, confianca.

| Fraco (não use) | Forte (use) |
| --- | --- |
| Topo sem proposta clara | Quem chega não sabe que vocês fazem RH para empresas |
| Serviços sem explicação | Recrutamento escondido num parágrafo |
| Google não sabe o que fazem | (corte: é ponto de técnico) |
| Sem depoimentos de clientes (e o site tem nota 5,0) | Nota 5,0 no Google só lá embaixo |
| Pouco conteúdo sobre a empresa | +100 cidades atendidas e ninguém vê de cara |
| (não existia) | O site convida candidatos antes de clientes |

Também, se o site mostrar: `diferencial` (até 48 caracteres, real, ex.: "Desde 2009 em Campinas"), `especialidade`, `segmento`, `cidade`, e um `resumo` de 2–3 frases da sua leitura.

## Antes de concluir, confira

- [ ] Os 3 passam no teste do dono (só desta empresa, fala de cliente, aparece no print)?
- [ ] Se o site tem um ativo forte (nota, anos, números, cases), um dos pontos é ele?
- [ ] Nenhuma citação vem de carrossel; toda citação está no print?
- [ ] São 3 assuntos diferentes?

## Formato (arquivo JSON)

```json
{
  "points": [
    { "kind": "escondido", "text": "…", "short": "…", "impacto": "…", "anchor": "…" },
    { "kind": "publico_errado", "text": "…", "short": "…", "impacto": "…", "anchor": "…" },
    { "kind": "servicos", "text": "…", "short": "…", "impacto": "…", "anchor": "…" }
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
node analista.js proximo         # pega 1: prints, fatos medidos, texto e textos de carrossel
(olhe os 3 prints, leia o texto, escreva o JSON em .trabalho/analise-<job>/pontos.json)
node analista.js concluir <job> <lease> .trabalho/analise-<job>/pontos.json
```

Repita `proximo` até não haver mais trabalho.
