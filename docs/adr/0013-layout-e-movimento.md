# 0013. Sistema de layout e movimento (Briefing de UI/UX)

- **Status:** Aceito
- **Data:** 2026-10-31

## Contexto

O Briefing de UI/UX (Gabriel, 31/10) analisou 17 telas e concluiu que a identidade visual está
certa, mas falta ordem:
- navegação sem rótulos e sem grupos;
- uma largura diferente em cada página, com o cabeçalho longe do conteúdo;
- duas ou três versões de cada componente.

A regra do briefing: nenhuma cor, fonte ou card novo, e nenhuma regra de negócio muda.

## Decisão

1. **Grade única de página** (`globals.css`).
   - `.page-container` e `.page-body`: cabeçalho, filtros e conteúdo na mesma borda esquerda.
   - **Largura:** fluida, com margem de 32 px (24 px abaixo de 1280) e teto de 1600 px
     centralizado.
   - **Variantes alinhadas à esquerda:** `is-narrow` (720 px) só onde a leitura pede, e
     `is-medium` (1100 px) para matrizes.
   - **Cabeçalho:** `PageHeader` fica fixo e encolhe ao rolar; o `back` vira o caminho acima do
     título.
   - **Trava:** um teste (`pages.test.ts`) reprova o container antigo.
2. **Barra lateral em grupos**, definidos em `pages.ts › section` e travados por teste.
   - **Grupos:** Dia a dia, Vendas, Criação, Gestão, e Sistema no rodapé.
   - **Expansão:** ao passar o mouse ou focar, abre sobre o conteúdo, com rótulos; também dá para
     fixá-la aberta.
   - **Indicador ativo:** desliza até o item.
   - **Badge:** limitado a 99+, e o do Pipeline conta só os seus leads que pedem ação.
   - **Abas por pessoa:** o filtro da ADR 0012 continua valendo.
3. **Tokens de movimento:** `--dur-1..4` (120/180/240/320 ms) e `--ease-out/in/std`.
   - Página: só o conteúdo entra (240 ms, 8 px).
   - Cascata: 30 ms, no máximo 6 itens.
   - Modais: o fundo desfoca de 0 a 6 px, e a janela vai de 0,96 a 1.
   - Toasts: barra de 5 s no "Desfazer".
   - Botão: press em 0,98. Card clicável: sobe 1 px.
   - KPIs: contam até 600 ms, só na primeira carga da sessão.
   - Reduzir movimento: corta tudo.
4. **Um padrão por componente:**
   - **Abas de seção** (`SectionTabs`, sublinhado que desliza) × **Segmented** (modo ou filtro,
     fundo que desliza).
   - **Estado vazio:** `EmptyState`.
   - **Link de ação:** cinza, laranja no hover (`action-link`).
   - **Chip selecionado:** cinza escuro suave. O preto fica só para ação.
   - **Rótulo de KPI:** numa linha.
   - **Variação percentual:** some quando a base é pequena demais (`meaningfulPct`).
5. **Gráficos:**
   - Rótulo direto no fim da linha ou da barra.
   - Grade horizontal a 6%, sem linha de eixo.
   - Cores fixas: entradas verde, saídas coral. O laranja fica só para ação e para a linha do
     saldo.
   - Barras crescem da base.
   - Nenhum número novo: tudo vem das regras de domínio.

## Consequências

- **Página nova** usa `PageHeader` + `.page-body`, e o teste garante isso.
- **Faixa de KPIs na Início:** respeita as abas da pessoa. Quem não vê o Financeiro não vê saldo
  nem meta.
- **Selects nativos:** ainda restam em filtros secundários. A troca pelo select customizado segue
  tela a tela.
