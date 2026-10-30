# 0007. Frontend guiado, com uma fonte só para cada informação, rumo a apps independentes

- **Status:** Aceito
- **Data:** 2026-10-30

## Contexto

O app vai crescer, e cada área (Pipeline, Financeiro, Conteúdos…) pode virar um app próprio. A revisão
do frontend achou o que travaria isso e o que confundia quem usa:

1. **O mesmo número calculado de dois jeitos.**
   - O saldo da Início somava até movimento realizado com data futura; o do Financeiro parava em hoje.
   - A página de Produto contava entradas *previstas* como recebidas e incluía leads descartados no
     pipeline.
   - As explicações dos números também divergiam entre as telas.
2. **Pessoas da equipe em duas fontes.**
   - Havia uma lista fixa no código, alterada em tempo de execução, e a tabela `members` do banco.
   - A cor de cada pessoa dependia da posição na lista.
   - O botão de redistribuir leads congelava a lista ao abrir o app e ignorava quem entrou depois.
3. **Nome, ícone e explicação das páginas repetidos** entre o menu e cada página. Cada página se
   explicava de um jeito: faixa de texto longa, vários "?", ou nada.
4. **Telas duplicadas.** O Cofre estava idêntico em duas rotas e o "não encontrado" copiado em 5
   páginas.
5. **Letras de 9–11px** e uma barra de celular com 14 ícones espremidos.
6. **Áreas usando telas de outras áreas diretamente**, o que impede separar em apps.
7. **Dois jeitos de guardar dados na tela** (store central e `createCollection`) e **dois sistemas de
   eventos** (em memória e no banco).

Fundamentos:

- **Uma definição por número (metrics layer).** Cada métrica é definida uma vez, junto do cálculo, e
  todas as telas leem dela. Também segue o DRY: cada conhecimento com uma representação única
  (Hunt & Thomas, *The Pragmatic Programmer*, 1999).
- **Ajuda sob demanda.**
  - Progressive disclosure: adiar o secundário deixa o app mais fácil de aprender e com menos erros
    (Nielsen Norman Group).
  - Heurística 10 de Nielsen (1994): ajuda focada na tarefa, em passos concretos, e puxada pela
    pessoa, não empurrada.
  - Menos texto e menos ícones reduzem a carga cognitiva (Sweller, 1988; Krug, *Don't Make Me
    Think*, 2000).
- **Qualquer idade.**
  - Pessoas de 65+ completam menos tarefas e levam mais tempo em interfaces web (Nielsen Norman
    Group).
  - WCAG 2.2, critério 2.5.8 (nível AA): alvos de toque de no mínimo 24×24 px. O nível AAA recomenda
    44×44.
- **Fronteiras para virar apps.** Micro frontends: partes entregáveis de forma independente, com
  fronteiras claras (Cam Jackson, martinfowler.com, 2019). Ocultação de informação (Parnas, 1972).

## Decisão

1. **Números:** `src/lib/domain/metrics.ts` é a fonte única de nome, explicação e cálculo de cada
   número.
   - O `StatCard` recebe `metric="…"`.
   - O saldo tem um cálculo só (`balance` = `balanceAsOf(hoje)`).
   - Produto usa as mesmas regras do resto do app: só entradas realizadas; descartado não é pipeline.
2. **Pessoas:** a tabela `members` é a fonte única.
   - `src/config/team.ts` só deriva nome, iniciais e cor. A cor sai do id, então é estável; os
     fundadores mantêm a cor de sempre.
   - Componentes usam `useTeam()`, que acompanha quem entra e sai.
3. **Páginas:** `src/config/pages.ts` é a fonte única de nome, ícone, propósito e "como usar".
   - Menu, barra do celular, busca e cabeçalho (`<PageHeader page="/rota">`) derivam dele.
   - Palavras do dia a dia ficam em `src/config/glossary.ts`.
4. **Guiado sem poluir.**
   - Um botão "Como usar" por página abre um painel lateral com os passos e o significado de cada
     número e palavra.
   - Na primeira visita, um ponto laranja indica que o botão existe. Nada abre sozinho.
   - "?" só nos números principais. Explicação longa sai da tela.
   - Texto informativo com no mínimo 12px.
   - No celular: 4 destinos principais + "Menu" com todas as áreas, com alvos de 48px.
5. **Uma tela por coisa.** `NotFound` único para os detalhes. `/equipe/cofre` redireciona para
   `/cofre`.
6. **Travas automáticas.**
   - `src/config/pages.test.ts`: página sem explicação, número explicado fora de `metrics.ts` ou
     título digitado fora do registro reprovam o teste.
   - O lint avisa quando uma área importa tela de outra (`eslint.config.mjs`, `FEATURE_MODULES`).

## Consequências

- Mudar um nome, uma explicação ou um cálculo acontece em **um lugar**, e todas as telas, e futuros
  apps, acompanham.
- **O saldo da Início pode mudar** em relação ao que aparecia antes, se houver lançamento realizado
  com data futura. Agora ele é igual ao do Financeiro, e esse é o valor correto.
- **Produtos:** "Entradas" e "Resultado" deixam de contar contas previstas; o pipeline do produto deixa
  de contar descartados.
- **Próximos passos**, nesta ordem, cada um em PR próprio combinado com a equipe:
  1. **Zerar os avisos de fronteira**:
     - `board` → `mindmap` (`board-nodes.tsx`, `whiteboard-editor.tsx`);
     - `dashboard` → `goals` (`team-panels.tsx`);
     - `mindmap` → `tasks` (`mind-map-editor.tsx`);
     - `prospecting` → `ai-office` (`funnel-tab.tsx`).

     O que é comum vai para `shared` ou `entities`.
  2. **Store por área:** as 7 coleções de `src/lib/store.ts` (leads, atividades, tarefas, notas,
     lançamentos, mapas, configuração financeira) migram, uma por vez, para `createCollection` em
     `src/lib/modules.ts` (Strangler Fig, Fowler 2004). Cada área fica dona dos seus dados.
  3. **Um sistema de eventos só:** os eventos de tela (`src/lib/events.ts`) passam a ser os mesmos
     gravados no banco (`src/lib/event-service.ts`).
