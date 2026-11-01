# 0014. Identidade dos mocks: abas em cápsula, luz discreta e leitura para qualquer um

- **Status:** Aceito
- **Data:** 2026-11-01

## Contexto

Depois do briefing (ADR 0013), o time trouxe imagens de referência de cada tela (Pipeline,
Conteúdos, Financeiro, AI Office, Mapas, Clientes, Metas, Prospecção, Caixa de entrada,
Configurações). O pedido tinha três partes:
- aplicar a disposição das imagens;
- seguir o estilo das barras da Apple nas abas;
- ter efeitos de luz ("LED") que não ocupem a tela nem chamem mais atenção que a informação.

Depois veio mais um pedido: que todas as páginas tenham conteúdo claro, com respiro, para qualquer
pessoa conseguir trabalhar.

## Decisão

1. **Abas de seção em cápsula** (`SectionTabs`).
   - Uma cápsula flutuante em que a aba ativa é uma pílula preenchida, como as tab bars do iPadOS.
   - Fonte: Apple Human Interface Guidelines, *Tab bars*.
   - Filtros e modos continuam em `Segmented`.
2. **Luz como acento, nunca como conteúdo** (`Led`).
   - É uma curva pequena e fraca no canto do card.
   - Vai em no máximo um card por faixa: meta, ticket médio, fila do dia, agente selecionado.
   - No fundo da página há uma brasa no canto inferior direito, a 7%.
   - Motivo: o olho vai primeiro para o que tem mais contraste (NN/g, *Visual Hierarchy in UX*).
     A luz não pode ganhar do número.
3. **Uma ação principal por página, em laranja** (`variant="brand"`).
   - Exemplos: Novo lead, Nova meta, Capturar, Entrada.
   - As demais ações ficam em contorno.
   - Fonte: NN/g, *Primary & Secondary Action Buttons*.
4. **Padrões de bloco.**
   - `StatCard`: ícone num quadrado laranja à esquerda, rótulo em letra normal.
   - `Panel`: `icon` opcional no título.
   - `BigEmpty`: seção inteira vazia.
   - `EmptyState`: vazio dentro de listas e colunas.
   - Lista e detalhe lado a lado onde se trabalha item a item: AI Office e Caixa de entrada.
5. **Leitura e respiro.**
   - **Corpo:** nunca abaixo de 14 px (`t-desc`), com entrelinha de 1,5.
   - **Rótulos:** nunca abaixo de 11 px. Ficam de fora só os contadores em bolinha.
   - **Título de bloco:** 16 px.
   - **Espaço:** painéis com mais espaço interno e fim de página com 48 px.
   - Fontes: WCAG 2.2, 1.4.4 e 1.4.12; NN/g, *Legibility, Readability, and Comprehension*.
6. **Etapas do funil com cor própria.**
   - Novo laranja, contato azul, proposta cinza, negociação coral e ganho verde.
   - Ficam em `--stage-*`, a fonte única usada por `stageColor`.

## Consequências

- **Página nova:** usa `PageHeader`, `.page-body`, os blocos acima e uma única ação laranja.
- **Luz:** antes de pôr `led` num card, verificar que ele é o mais importante da faixa.
- **Pendente:** o mock da Agenda mostra o menu principal aberto com nomes. Isso muda o menu do app
  todo (ADR 0013, item 2) e aguarda decisão.
