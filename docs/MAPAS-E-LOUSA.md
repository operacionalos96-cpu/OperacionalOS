# Mapas: lousa livre + mapa estruturado

Estado desta entrega, vínculos, avaliação da base compartilhada e etapas. O briefing HZK §4.1 não veio nos arquivos recebidos; o escopo segue o texto do pedido e deve ser conferido com ele.

## 1. Os dois modos

| | Lousa livre | Mapa estruturado |
|---|---|---|
| Para quê | Brainstorm, rascunho, reunião, fluxo desenhado | Árvore/fluxo de ideias ligado ao andamento do trabalho |
| Elementos | Formas (retângulo, elipse, losango), notas, texto solto, desenho, imagem, moldura | Balões tipados (ideia, projeto, tarefa, venda, decisão…), grupos |
| Conexões | Setas entre quaisquer elementos: curva/reta/ângulo, 4 pontas, tracejada, cor, legenda | Linhas de hierarquia e relação, com legenda e sentido |
| Modelos | Em branco, Brainstorm, Retrospectiva, Fluxo livre | 10 modelos (estratégia, processo, projeto, funil…) |
| Extras | Minimapa, "Ir para…", molduras, colar imagem, copiar/colar | Lista, apresentação, IA, foco no ramo, minimapa |

`MindMap.mode` (`"lousa"` | `"estruturado"`) decide o editor. Mapas antigos, sem o campo, são estruturados. Os dois gravam nas mesmas tabelas (`map_nodes`, `map_edges`): **nenhuma migração de banco**. Tipos novos de elemento (`shape`, `sticky`, `image`) e campos novos (`shape`, `src`, `fontSize`, `fill`, `route`, `dashed`, `hue` da linha) são opcionais; versões antigas do app preservam o que não conhecem (`storedType`).

## 2. O que foi corrigido (legibilidade e navegação)

- **Conexões:** de 1px cinza `#b1b1b7` para 2,5px na cor do texto do tema (3,5px selecionada), setas de 20px, tracejado para "relação". Vale para os dois editores (tokens `--edge` em `globals.css`).
- **Tamanhos:** texto mínimo de 12px (eram 9–11px em 39 pontos), pontos de conexão de 8px para 14–16px, cantos de redimensionar de 9px para 12px, balões com borda de 2px e texto de 15px. Botões da lousa de 40–44px.
- **Navegação:** minimapa, zoom com %, enquadrar tudo / aproximar do selecionado, busca "Ir para…" (texto e molduras), atalhos num popover (a faixa de 3 linhas de 11px sobre o mapa saiu).
- **Tela:** modo foco (esconde o menu lateral), barras flutuantes em vez de painéis fixos, painel lateral do balão só abre sozinho em telas ≥ 1400px.

## 3. Vínculos com tarefas e projetos

**Já funciona (sem campo novo):**
- Elemento ↔ tarefa (`taskId`), lead (`leadId`) e `ref` para produto, meta, conteúdo, nota, lançamento ou outro mapa. Botão **Vincular** (busca em tudo) e **Criar tarefa** a partir do elemento; chips clicáveis abaixo do elemento.
- Sentido inverso: o painel **Conexões** da tarefa/lead/produto já lista "no mapa · título" (`entities/relations.ts`); coberto por teste com elementos de lousa. O status do balão estruturado já segue o da tarefa (inclui recorrência).

**Lacunas assumidas:**
1. Não existe entidade **Projeto**. Hoje "projeto" = Meta, Produto ou o tipo de balão "Projeto". Proposta: criar `project` em `EntityType` (+ resumo, rota, ícone), sem mexer nos mapas, que já vinculam por `ref`.
2. Um elemento liga no máximo 1 tarefa + 1 lead + 1 `ref`. Para N:N, usar a coleção `relations` (que já existe, com `mapNode` como tipo de entidade) em vez de novos campos.
3. Na lousa, o andamento da tarefa não é mostrado no chip (só no mapa estruturado).

## 4. Base compartilhada e colaboração simultânea

**O que existe (verificado no código):**
- Um registro por elemento/linha, gravação incremental com atraso de 0,4s: duas pessoas editando elementos diferentes não se sobrescrevem.
- Realtime do Supabase nas duas tabelas; mudança remota entra elemento a elemento sem desfazer o que está sendo editado aqui.
- Acesso: RLS por `private.is_member()`. Todo membro da equipe lê e grava todos os mapas.

**O que NÃO existe (portanto não deve ser anunciado como colaboração):**
- Presença, cursores e seleção remota.
- Resolução de conflito: o mesmo elemento editado por duas pessoas é "última gravação vence".
- O eco próprio é filtrado por `updated_by`; **a mesma conta em duas abas/dispositivos não vê as mudanças da outra** (são tratadas como eco).
- Permissão por mapa (compartilhar com parte da equipe, só leitura), e isolamento entre equipes diferentes.
- Edição offline e reconciliação; desfazer é local (não desfaz o que o outro fez).
- Arraste em tempo real: o outro só vê o elemento depois da gravação (~0,4s após parar).
- Imagens: o registro aceita < 64 KB, então a imagem entra reduzida (≤ 44 KB). Arquivo grande exige Supabase Storage (já usado em Conteúdos: `content-storage.ts`).

**Plano de evolução:** (a) corrigir o eco por sessão em vez de por usuário; (b) presença e cursores via Realtime Presence/Broadcast, sem gravar no banco; (c) permissão por mapa (`map_members` + RLS); (d) protótipo isolado de edição concorrente de texto (CRDT, p. ex. Yjs) só se (a)–(c) mostrarem conflitos reais. Cada passo com teste de 2+ participantes antes de virar promessa.

## 5. Recuperação

- Autosave por elemento; recarregar a página restaura elementos, textos, setas, legendas e vínculos (demonstrado, ver §7).
- Desfazer/refazer (Ctrl+Z/Y) e exclusão de mapa com "Desfazer".
- **Exportar** (.json, formato versionado `operacionalos.board`) e **Importar** na tela Mapas: cópia de segurança e recuperação manual. A importação descarta o inválido sem recusar o resto e recusa arquivo de versão mais nova. Duplicar mapa.
- Mapas antigos: migração para um registro por balão preservada; o JSON antigo continua como backup.
- **Ainda não coberto:** histórico de versões no servidor e teste de reconexão após queda de rede.

## 6. Etapas de implementação

| Etapa | Escopo | Critério de pronto | Estado |
|---|---|---|---|
| 1. Base e legibilidade | Modos, contraste, tamanhos, navegação, modelos | Os dois editores legíveis em 100% de zoom, testes de regras | **Feito** |
| 2. Lousa funcional | Formas, notas, texto, desenho, imagem, molduras, setas, copiar/colar | Criar, editar, conectar e recuperar demonstrados | **Feito** (imagem limitada a 44 KB) |
| 3. Vínculos | Entidade Projeto, N:N via `relations`, andamento no chip, "Aparece em…" nas telas de projeto/meta | Vincular e ver o inverso em qualquer tela | Aberto |
| 4. Imagens grandes e versões | Storage para imagens; histórico de versões; teste de queda de rede | Imagem de 5 MB; restaurar versão de ontem | Aberto |
| 5. Presença | Eco por sessão, cursores, seleção remota (Realtime Presence) | 2 pessoas veem os cursores; mesma conta em 2 abas sincroniza | Aberto |
| 6. Permissões | `map_members`, leitura/edição por mapa, testes de RLS | Mapa privado não aparece para quem não foi convidado | Aberto |
| 7. Edição concorrente | Protótipo CRDT isolado, só se necessário | Teste com 3+ pessoas, sem perda de texto | Avaliar |

## 7. Como foi verificado

- `vitest`: 251 testes passando (18 + 1 novos para regras da lousa, vínculos, busca, exportar/importar, imagens e modelos). `tsc` e `eslint` sem erros nos arquivos novos.
- Navegador (Chromium, **modo demonstração local**): criar lousa a partir de modelo, editar texto, ligar a uma tarefa, rotular seta, recarregar (5 elementos, 4 setas, texto e vínculo mantidos), exportar (`.json` com `taskId`). Capturas antes/depois do mapa estruturado em tema escuro e claro.
- **Modo demonstração** (`NEXT_PUBLIC_SANDBOX=1`, só em desenvolvimento; ignorado em produção): troca o Supabase por um banco no navegador e dispensa login. Não testa RLS, realtime nem rede real.
- **Não verificado:** build de produção (o ambiente de teste não alcança o Google Fonts), uso com Supabase real, celular/toque, desempenho com milhares de elementos, navegadores além do Chromium.
