# Implementação PT1–PT3 — Tarefas, Financeiro e Marketing

## PT1 — Tarefas & Notas

- Tarefas têm campo opcional `projectName`, persistido junto ao registro existente; criação rápida e formulário detalhado aceitam projeto.
- A lista permite busca por título, descrição e projeto, filtro por projeto, responsável e prioridade/etiqueta já existentes. Os responsáveis continuam usando os membros atuais da equipe.
- Notas têm `projectName` e `taskId` opcionais, pesquisa por título/corpo/vínculo, filtro por projeto, título ampliado e área de edição mais larga.
- O painel da tarefa mostra notas ligadas diretamente e notas do mesmo projeto.
- Não foi criada uma entidade central `projects`: nomes de projeto são strings livres, compatíveis com os dados antigos e sem migração estrutural. Se o produto exigir permissões, orçamento, status e cadastro de projeto, o passo seguinte é criar entidade própria e migrar esses nomes.

## PT2 — Financeiro

- A tela está dividida em Visão geral, Movimentações, Contas a pagar e Contas a receber.
- `Transaction.status` opcional: `previsto` ou `realizado`. Registros antigos sem status mantêm a semântica anterior e são tratados como realizados.
- Saldo, resultado mensal, meta e gráficos de caixa ignoram registros `previsto`. Ao marcar uma conta como paga/recebida, ela passa a `realizado` e usa o vencimento como data efetiva inicial.
- Contas previstas guardam `dueDate`, categoria, valor, projeto e vínculo com lead/cliente quando aplicável. `date` continua sendo a data efetiva do movimento.
- O seletor de mês explicita o período dos indicadores mensais; gráficos indicam suas janelas de 30/90 dias.
- Limitação: o vínculo atual com cliente usa `leadId` (pipeline) e o vínculo de projeto é texto. Não foi criada entidade de fornecedor/cliente financeiro independente.

## PT3 — Marketing / Conteúdos

- Produção mantém quadro por etapas e filtros por frente/marca, conta e produto.
- Contas têm `brand` opcional e livre, permitindo HZK, Gabriel ou futuras frentes sem esquema fixo. Conteúdos podem ter `brand` e `accountId`; publicações continuam ligadas à conta efetiva em `ContentPost.accountId`.
- Criação de conteúdo aceita frente e conta principal. Métricas filtram por frente, plataforma, conta e intervalo de datas, usando `metricsAt` ou `publishedAt` como referência temporal e somando somente publicações publicadas, como a regra atual já exige.
- As métricas continuam sendo dados manuais ou de integrações já configuradas. Não foram inventadas novas integrações nem credenciais. Fontes e integrações futuras devem ser acordadas com o cartão de APIs/webhooks.

## Critérios de validação sugeridos

1. Criar tarefa com projeto, responsável, prioridade e prazo; localizá-la por busca e filtros.
2. Criar nota de reunião, editar texto, vincular tarefa/projeto e abrir a nota pelo painel da tarefa.
3. Criar uma conta a pagar/receber prevista e confirmar que não muda saldo, resultado nem gráficos; marcar como paga/recebida e confirmar que passa a afetar o caixa.
4. Trocar o mês do seletor e conferir os indicadores do período selecionado.
5. Criar contas de marketing em frentes distintas e uma terceira frente; conferir Produção e Métricas por frente, plataforma, conta e período.

## Limitações da entrega

- O briefing HZK §4.2–4.4 não está no arquivo fornecido; os requisitos acima vêm do escopo PT1–PT3 enviado na conversa.
- Não foi possível confirmar visualmente todos os fluxos nesta execução. Build, lint e suíte completa devem ser executados no ambiente com dependências instaladas antes de aprovar a entrega.
