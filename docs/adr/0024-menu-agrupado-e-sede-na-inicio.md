# 0024. Menu agrupado e Sede 3D na Início

- **Status:** Proposto
- **Data:** 2026-11-24

## Contexto

O menu tinha 18 itens e cerca de 30 abas internas. Pedido do Igor (24/11): há páginas demais
escondidas, coisas que podem se agrupar, e a Sede 3D pode ficar na Início.

O que o levantamento mostrou:
- **Sede 3D** era a 5ª aba do AI Office: quem não abre o AI Office nunca via.
- **Caixa de entrada** e **Tarefas** eram dois itens para um fluxo só (capturar, triar, fazer).
- **Equipe** tinha 7 abas, misturando o dia a dia do time com o cadastro (membros, cargos, árvore)
  e com uma aba "Agenda" que só levava para a página Agenda.
- **Cofre** era um item do menu usado por uma pessoa (o owner).

## Decisão

1. **Entrada vira aba de Tarefas** (`/tarefas?aba=entrada`): Entrada · Tarefas · Notas.
   - O selo de Tarefas no menu soma o que está atrasado com o que espera triagem; a aba mostra a
     contagem da Entrada.
2. **Cadastro e cofre vão para Configurações**, em abas no endereço (`?aba=`): Empresa · Pessoas ·
   Cofre.
   - **Pessoas:** membros (em cartões ou na árvore, que são dois modos de ver as mesmas pessoas) e
     cargos.
   - **Cofre:** a aba só aparece para o owner; o servidor continua conferindo a cada pedido.
3. **Equipe fica com o dia a dia:** Responsabilidades · Semana do time · Acesso por área.
   - "Acesso por área" **não** foi para Configurações: todo mundo consulta o próprio nível ali e
     quem gere uma área concede acesso por ela (ADR 0020). Configurações exige nível admin
     (ADR 0012), então mover tiraria a tela de quem precisa dela.
4. **Sede 3D na Início**, num bloco recolhível logo abaixo da saudação.
   - A escolha (aberta ou recolhida) fica guardada no navegador de cada pessoa.
   - Recolhida, a cena não é montada e o three.js não é baixado. Aberta, continua com `import()`
     dinâmico (ADR 0021), então o primeiro desenho da Início não espera o 3D.
   - A aba "Sede 3D" saiu do AI Office: a Sede tem um lugar só.
5. **Endereços antigos só redirecionam** (`/caixa-de-entrada`, `/cofre`, `/equipe/cofre`,
   `/equipe?aba=membros|cargos|hierarquia`), como já era feito com `/equipe/cofre`.

O menu passa de 18 para 16 itens e as abas internas de Equipe, de 7 para 3. Nenhuma regra de negócio
nem permissão do banco muda.

## Por quê

- **Menos opções no mesmo nível, decisão mais rápida.** O tempo de escolha cresce com o número de
  alternativas (Hick, 1952, *On the rate of gain of information*; Hyman, 1953).
- **Abas servem para alternar entre visões do mesmo contexto**, não para guardar assuntos
  diferentes (Nielsen, *Tabs, Used Right*, NN/g, 2016). Entrada, Tarefas e Notas são o mesmo
  contexto; "Sede 3D" dentro do AI Office não era.
- **O que é raro e de poucos sai do caminho principal** (Nielsen, *Progressive Disclosure*, NN/g,
  2006): cadastro de cargos e cofre ficam em Configurações.
- **Cada informação num lugar só** (Hunt e Thomas, *The Pragmatic Programmer*, 1999, princípio DRY):
  uma tela de cofre, uma de caixa de entrada, uma Sede; o resto é redirecionamento.
- **Endereço publicado não quebra** (Berners-Lee, *Cool URIs don't change*, W3C, 1998): os links
  antigos, inclusive os das notificações já enviadas, continuam abrindo a tela certa.

## Consequências

- Quem não é admin deixa de ver a lista de membros em cartões e a árvore (estavam em Equipe). As
  pessoas e o que cada uma faz continuam em Equipe › Responsabilidades.
- O ajuste de menu por pessoa (`team_settings.pagesByMember`) pode ter `/caixa-de-entrada` ou
  `/cofre` gravados: são ignorados, não precisam de migração.
- A Início com a Sede aberta baixa o three.js (~46 KB de código da cena, mais a biblioteca e o
  modelo). Quem sentir peso recolhe o bloco uma vez e o app lembra.

## Fora desta decisão

Clientes dentro do Pipeline e AI Office junto com o HZK Dock foram avaliados e ficaram como estão.
