# Diagnóstico de usabilidade — navegação, busca, criação, metas e cofre

## Escopo e método

Este documento registra uma **auditoria estática do código**. Não houve sessão observada com usuários, telemetria de cliques ou teste de usabilidade moderado; portanto, os itens abaixo são riscos reproduzíveis pelo fluxo implementado ou hipóteses de atrito a validar, não afirmações sobre comportamento de usuários reais. Nenhuma reformulação dessas áreas foi aplicada nesta entrega.

## Resumo de prioridade

| Prioridade | Área | Diagnóstico | Impacto provável | Dependência |
|---|---|---|---|---|
| P1 | Busca global | A paleta `Ctrl/Cmd+K` lista entidades registradas e ações de criação, mas o placeholder não representa todas as categorias; não oferece filtros explícitos por tipo/estado. | Usuário pode não perceber que metas, mapas, lançamentos e notas também são pesquisáveis; muitos resultados podem ficar difíceis de separar. | Telemetria e teste com tarefas reais; manter registry como fonte única. |
| P1 | Criação global | Menu “Buscar ou criar” expõe novo lead, tarefa e entrada/saída financeira, mas não cobre todas as entidades criáveis (nota, produto, conteúdo, meta, mapa). | O usuário pode navegar manualmente para outra área para iniciar um registro e não descobrir ações contextuais. | Decidir quais criações devem ser globais e quais precisam de contexto. |
| P1 | Cofre | A lista é liberada após desbloqueio, sem busca/filtros/categorias visíveis; a senha do cofre vale para a equipe. Segredos se ocultam em 30 s e o cofre tranca em 5 min. | Com muitos itens, encontrar credenciais pode ficar lento; senha compartilhada reduz atribuição individual e requer governança. | Segurança, auditoria e política de acesso; não alterar sem decisão. |
| P2 | Navegação geral | Menu lateral organizado por áreas e navegação móvel separada. O número de destinos pode crescer; não há indicação global de contagens/estado para todos os módulos. | Descoberta de áreas e retorno a tarefas pendentes podem piorar com crescimento do produto. | Teste de árvore de navegação e telemetria. |
| P2 | Metas | Lista separa “Em andamento” e “Encerradas” por data final. Progresso depende da fonte escolhida; metas de tarefa dependem de relações com tarefas. | Meta vencida pode aparecer como encerrada mesmo sem ser concluída; não há filtro por responsável, origem ou progresso na lista. | Confirmar significado de “encerrada” e critérios de metas com a equipe. |
| P2 | Busca de entidades | Busca global resume títulos/subtítulos e campos extras configurados por entidade; tarefas e notas têm buscas locais adicionais. | Busca global pode não encontrar termos existentes em campos que não entram no resumo; resultado depende de dados carregados no cliente. | Definir quais campos são pesquisáveis e testar volume real. |

## Evidências por área

### Navegação

- `src/components/shell/nav.ts` define seções Vendas, Inteligência, Marketing e Gestão.
- `src/components/shell/app-shell.tsx` mostra menu lateral, navegação móvel, atalho `Ctrl/Cmd+K` e menu de criação.
- O menu usa rótulos estáveis e sinal de página ativa; os badges são limitados a leads que precisam de ação e tarefas atrasadas do usuário atual.

**Risco a validar:** quando um módulo crescer ou receber subáreas, o menu pode ficar longo ou esconder caminhos secundários. Não alterar a taxonomia antes de observar tarefas comuns.

### Busca global

- `src/components/shell/command-palette.tsx` combina ações, destinos e entidades do registro global.
- `src/lib/entities/summary.ts` define as entidades indexadas e o resumo pesquisável.
- A busca atual inclui tarefas, leads, produtos, conteúdos, notas, mapas, lançamentos, metas e membros. Cofre não está no registro de entidades pesquisáveis.
- A busca global é baseada em dados já carregados no cliente; não é uma busca full-text remota sobre todos os campos do banco.

**Problema reproduzível:** o placeholder cita lead/produto/conteúdo/nota/ação, mas não as demais categorias incluídas. A criação global não inclui meta, nota, mapa, produto ou conteúdo.

### Botão de criação

O menu global oferece Novo lead, Nova tarefa, Nova entrada e Nova saída. Os demais registros são criados nas respectivas páginas. Isso é coerente para ações financeiras e CRM, mas pode gerar inconsistência se a equipe esperar um único ponto de criação para todos os objetos.

**Proposta para avaliação:** testar 5 tarefas comuns e medir se o usuário procura primeiro o menu global ou a página do módulo; não ampliar o menu sem validar frequência e risco de criar registro sem contexto.

### Metas

- `src/app/metas/page.tsx` separa metas futuras/atuais de metas cuja data final já passou.
- `src/components/goals/goal-bits.tsx` permite receita, vendas, tarefas ou meta manual; permite intervalo de datas e, para receita/vendas, filtro opcional por produto.
- `src/app/metas/[id]/page.tsx` mostra progresso, edição, exclusão com desfazer, contexto e conexões.

**Riscos a validar:** “Encerradas” significa data passada, não necessariamente meta concluída. Confirmar se metas vencidas incompletas devem ter um estado próprio; validar datas em timezone local, metas sem alvo e progresso de tarefas sem vínculo.

### Cofre

- `src/app/cofre/page.tsx` busca lista de itens sem carregar segredos; exige desbloqueio, permite criar/editar/apagar, revelar por item e trancar manualmente.
- Segredo revelado é ocultado em 30 segundos; ao trocar de aba é ocultado; cofre tranca em 5 minutos.
- A interface menciona que a senha do cofre vale para a equipe e não pode ser recuperada. A página lista nome, URL e última revelação, mas não tem busca, tags, categoria, favoritos ou ordenação visível.

**Riscos a validar:** encontrar um item com lista grande; entendimento do caráter compartilhado da senha; fluxo de rotação/revogação quando alguém sai da equipe; se auditoria de acesso é suficiente. Não relaxar controles de segurança para melhorar conveniência.

## Plano de teste com equipe

Executar com 3–5 pessoas que usam o produto, sem instrução prévia, e registrar sucesso/tempo/erros:

1. Encontrar uma meta por parte do título e abrir seus detalhes.
2. Encontrar uma nota cujo termo esteja no corpo, não no título.
3. Criar uma tarefa e depois criar uma nota vinculada a ela.
4. Criar uma entrada financeira pelo menu global e uma meta pela página correspondente.
5. Abrir o cofre, localizar uma credencial de teste, revelar e confirmar que ela volta a ocultar.
6. Distinguir uma meta vencida incompleta de uma meta concluída.

Critério inicial: 4/5 usuários completam cada tarefa sem ajuda; registrar erros de navegação e linguagem antes de decidir qualquer reformulação. Não usar credenciais reais durante teste.

## Não incluído

Não foram feitas alterações visuais ou funcionais em navegação, busca global, criação global, metas ou cofre nesta etapa. As propostas acima dependem de validação da equipe.
