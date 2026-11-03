# Modelo do vídeo de diagnóstico HZK (DX-001)

Pasta do lead → MP4, sem edição manual. O 3D, a voz e os sons são fixos e já estão prontos; cada lead só troca prints e textos.

## Instalar (uma vez)

1. Instale o Node.js 20 ou mais novo (nodejs.org, versão LTS).
2. Extraia a pasta num caminho curto, por exemplo `C:\hzk-video`. No Windows, caminhos longos impedem o navegador do Remotion de abrir, e o comando avisa quando isso acontece.
3. Abra um terminal nesta pasta e rode:

```bash
npm ci
```

O primeiro vídeo baixa o navegador do Remotion sozinho, por isso pede internet. Não é preciso instalar ffmpeg nem Blender.

## Gerar um vídeo

Nesta pasta:

```bash
node gerar_video.mjs "C:/caminho/da/pasta-do-lead" "C:/caminho/saida.mp4"
```

- Sem o segundo argumento, grava `video.mp4` dentro da pasta do lead.
- `--escala=0.5` gera uma prévia mais rápida (540×960).
- **Saída:** H.264, 1080×1920, 30 fps, CRF 22, yuv420p, faststart, áudio AAC a -16 LUFS.
- **Código de saída:** `0` gerou; `1` lead rejeitado, com a lista de erros, sem vídeo; `2` uso ou `dados.json` inválido.
- Vários leads podem rodar ao mesmo tempo: cada render usa uma pasta temporária própria, apagada no fim.

Requisitos do PC: Windows e Node. O 3D já vem renderizado, então não precisa de GPU. Neste PC, cada vídeo leva cerca de 2 minutos.

Para testar já: `node gerar_video.mjs exemplos/lead-a saida.mp4` (sites e dados fictícios, com faixa de teste).

**Licença:** o Remotion é grátis para empresas com até 3 pessoas; acima disso, é paga (remotion.dev/license).

## Pasta do lead

```
home.png      primeira tela no computador, 1440×900
pagina.png    página inteira, 1440 de largura, até 12000 de altura
mobile.png    primeira tela no celular, 780×1688
dados.json
```

## dados.json

| Campo | Obrigatório | Uso no vídeo |
|---|---|---|
| `empresa` | sim | Cartão do site analisado; a fonte reduz até caber |
| `url` | sim | Busca da abertura e barra do navegador |
| `cidade`, `especialidade`, `diferencial` | não | Linha abaixo do nome; o que faltar some da linha |
| `cor` | não | Filete acima do nome, `#RRGGBB`; inválida é ignorada |
| `segmento` | não | Aceito, mas não aparece no vídeo |
| `pontos` | sim, 3 | Ver abaixo |
| `teste` | não | **Campo novo.** `true` mostra a faixa amarela de vídeo de teste |

Cada ponto:

| Campo | Regra | Uso |
|---|---|---|
| `short` | até 48 caracteres | Título do ponto e lista da abertura dos pontos |
| `text` | até 220 | Completa "Um exemplo: …" na tela |
| `impacto` | até 180 | Caixa abaixo do exemplo |
| `print` | `home.png`, `pagina.png` ou `mobile.png` | Print exibido no ponto |
| `foco` | `[x, y, largura, altura]` em pixels do print, ou `null` | Zoom e marcação |
| `kind` | livre | Aceito, mas não muda o vídeo |

- `foco` parcialmente fora do print é ajustado aos limites; todo fora vira `null`. Os dois casos geram aviso.
- `foco: null` mostra o print inteiro. Se ele for comprido, a vista percorre a página de cima a baixo, sem marcação.
- Print com largura abaixo de 1000 px usa a janela estreita de celular.

## O que é fixo

- **Tempos (v3.2):** 112,6 s.

  | Trecho | Tempo |
  |---|---|
  | Abertura com a busca do site e os dados do lead | 0–12,6 s |
  | Hub 3D com o site no computador e no celular | 12,6–21,6 s |
  | Rua: alguém abre o site depois de uma indicação | 22,6–31,6 s |
  | "Por que não?" com a lista dos pontos | 31,8–40,4 s |
  | Pausa para a dica: o HZK pede para tirar print de cada ponto | 40,4–49 s |
  | Três pontos de 11 s cada, dentro de uma tela 3D com o HZK apontando | 49–82 s |
  | Fechamento e convite para responder no WhatsApp | 82–112,6 s |

- **Som:** a música vem da ElevenLabs Music e abaixa sozinha quando a narração fala. Os efeitos são fixos e já vêm em `public/dx/sfx`.
- **Narração:** não cita dados do lead e não afirma nenhum problema. Nos pontos, ela só conduz o olhar ("olha o que aparece para quem chega"); o diagnóstico fica na tela. Por isso não existe áudio por lead.
- **Regra de conteúdo:** o modelo não confere se um ponto é verdadeiro. Isso continua com a análise e a revisão humana.

## Refazer as partes fixas

Só é preciso se o roteiro ou o 3D mudarem, e isso é feito no estúdio da HZK. Em `01_system_core`:

```bash
python projects/dx001-diagnostico-sites/scripts/gerar_timeline.py
```

No estúdio (não vem neste pacote), o 3D é renderizado por `projects/dx001-diagnostico-sites/scripts/render_placa.py`, nos trechos `hub`, `rua`, `dica` e `ponto`. Depois, `codificar_placas.py` gera estes arquivos em `public/dx/`:
- `placa_hub.webm`, `placa_dica.webm` e `placa_ponto.webm`, com alfa;
- `placa_rua.mp4`;
- `cantos.json`, com as telas `home`, `mobile` e `analise`.
