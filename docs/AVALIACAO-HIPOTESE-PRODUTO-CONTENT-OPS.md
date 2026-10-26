# Ficha de avaliação de oportunidade — Content Ops para empresas e fundadores

**Status:** hipótese em descoberta; produto e programação ainda não aprovados.

## 1. Problema a investigar

Empresas pequenas, fundadores e equipes enxutas precisam transformar objetivos e ideias em uma rotina de conteúdo consistente: pauta, formato, responsável, aprovação, calendário, publicação e análise de resultado. A hipótese não é “falta mais um calendário”; é que a troca de contexto entre planejamento, revisão, publicação e aprendizado gera atrasos, retrabalho e falta de clareza de responsabilidade.

Ainda não há evidência primária suficiente de que esse problema seja frequente, doloroso e pago pelo público-alvo. A equipe deve entrevistar potenciais usuários antes de definir MVP.

## 2. Segmentos iniciais a comparar

1. **Fundador solo / especialista:** quer manter presença digital sem contratar equipe; baixa tolerância a configuração e orçamento.
2. **Pequena equipe interna (2–8 pessoas):** precisa de pauta, responsáveis, calendário e aprovação simples.
3. **Microagência / freelancer com vários clientes:** precisa separar marcas, revisar conteúdo com clientes e manter histórico por conta.

Não atender todos os segmentos na primeira versão. O segmento deve ser escolhido por intensidade do problema, facilidade de acesso a entrevistados e disposição a pagar.

## 3. Alternativas existentes e espaço possível

| Alternativa | Força aparente | Espaço a investigar (não afirmar como vantagem sem entrevistas) |
|---|---|---|
| Buffer | Agendamento multicanal e fluxo simples para criadores/equipes pequenas. | Se o público precisa de mais contexto de negócio antes do agendamento, ou se Buffer já resolve suficientemente. |
| Later | Planejamento visual, calendário e foco em redes visuais. | Se a dor principal é a produção/consistência e não a pré-visualização do feed. |
| Planable | Colaboração, revisão e aprovações com calendário visual. | Se pequenas equipes precisam de um processo de aprovação mais leve e ligado a tarefas/projetos. |
| Metricool | Planejamento e métricas, com foco em análise de desempenho. | Se a equipe precisa transformar métricas em decisões e tarefas, em vez de só visualizar relatórios. |
| Notion / Airtable | Estruturas flexíveis, documentos, tabelas e calendários configuráveis. | Se a configuração inicial é uma barreira e há valor em fluxo pronto e opinionado. |
| Hootsuite / Sprout Social | Gestão ampla, múltiplas contas e análises para operações maiores. | Se existe nicho de menor complexidade/custo sem competir por paridade de funcionalidades. |

Fontes de comparação secundária: Hootsuite lista ferramentas de calendário e diferenças de foco entre Buffer, Planable, Later, Asana, Notion e Airtable; Buffer descreve alternativas e características de agendamento. Esses materiais são úteis para mapear categorias, mas são conteúdo comercial/SEO e não provam satisfação do cliente nem tamanho de mercado.

- Hootsuite, content calendar tools: https://blog.hootsuite.com/content-calendar-tools/
- Hootsuite, social media scheduling tools: https://blog.hootsuite.com/social-media-scheduling-tools/
- Buffer, social media scheduling tools: https://buffer.com/resources/social-media-scheduling-tools/
- Later, comparison of social scheduling tools: https://later.com/blog/social-media-scheduling-tools/
- n8n docs (possível infraestrutura de automação, não diferencial de produto): https://docs.n8n.io/

Preços e limites mudam por plano e região; não usar preços de artigos de comparação como cotação atual.

## 4. Diferencial a testar

Hipótese de posicionamento: **“Da ideia à publicação com responsabilidade e aprendizado, em um fluxo leve para equipes pequenas.”**

Possíveis elementos, a validar individualmente:
- calendário editorial e quadro de etapas prontos para uso;
- tarefa e responsável explícitos por conteúdo;
- aprovação simples com histórico de feedback;
- vínculo entre conteúdo, objetivo/campanha e resultado;
- separar dados importados de métricas manuais;
- resumo semanal que sugere próximas ações, mas não publica nem altera estratégia sem autorização.

Não competir inicialmente em social listening, caixa de entrada unificada, edição de vídeo, publicação em todas as redes ou analytics avançado. Isso aumenta custo de API e risco de plataforma antes de validar a dor central.

## 5. Viabilidade técnica e comercial

### Técnica

- Calendário, quadro, responsáveis, comentários e estados são tecnicamente viáveis como SaaS comum.
- Publicação e métricas dependem de APIs oficiais, permissões, revisões de app, limites e mudanças de plataforma. Acesso e escopos devem ser confirmados por rede antes de prometer integração.
- A integração de IA pode começar com rascunhos e classificação, mantendo aprovação humana. Não é necessário criar agentes autônomos para testar o produto.
- Multi-tenant, segregação de dados por cliente, auditoria, exportação e exclusão são requisitos de base caso a ferramenta seja comercializada.

### Comercial

- Há concorrentes maduros e gratuitos/de entrada; “ter IA” ou “ter calendário” não é diferencial suficiente.
- O custo de suporte e de integrações por rede pode superar a receita de um plano muito barato.
- O modelo deve ser testado: por marca/workspace, por usuário ou por volume de conteúdo. Não fixar preço antes de entrevistar e testar oferta.

## 6. Experimento de descoberta (antes de programar)

**Duração sugerida:** 2 semanas.

1. Entrevistar 12 pessoas: 4 fundadores/solo, 4 equipes internas pequenas, 4 freelancers/agências pequenas.
2. Pedir para mostrarem o último ciclo real de conteúdo, da ideia ao relatório; não perguntar só se “gostariam” de uma ferramenta.
3. Registrar: ferramentas usadas, horas por semana, atrasos, erros, etapa mais dolorosa, impacto, workaround, custo atual e autoridade de compra.
4. Mostrar um protótipo navegável de baixa fidelidade, sem integração real, para 5 entrevistados.
5. Oferecer piloto manual de 4 semanas com escopo claro e pedir compromisso concreto (tempo, dados de exemplo e, se apropriado, pagamento/piloto pago).

### Sinais para avançar

- Pelo menos 7/12 entrevistados descrevem espontaneamente o mesmo problema recorrente com exemplo recente.
- Pelo menos 5/12 já usam workaround que custa tempo ou dinheiro e conseguem quantificar impacto aproximado.
- Pelo menos 3 organizações aceitam testar um piloto com data e responsável definidos.
- Pelo menos 2 demonstram disposição real a pagar ou assinar uma carta de intenção com faixa de preço a validar.

### Sinais para ajustar ou descartar

- Problemas variam muito entre segmentos e não há dor comum.
- A principal necessidade é publicação/analytics que exige APIs caras ou permissões ainda indisponíveis.
- Usuários resolvem bem com ferramentas atuais e não querem migrar o fluxo.
- Interesse é apenas em geração de texto genérico, facilmente substituída por ferramentas existentes.

Esses números são critérios propostos para a equipe decidir, não dados de mercado observados.

## 7. Recomendação atual

**Ajustar e validar antes de programar.** A categoria é competitiva e já existem soluções fortes para calendário, agendamento, aprovação e métricas. A oportunidade só merece avançar se entrevistas apontarem uma lacuna específica e repetida — preferencialmente conexão entre conteúdo, tarefas e resultados, ou aprovação simples para uma equipe muito pequena.

Se os sinais forem positivos, apresentar um MVP para aprovação com: um workspace, calendário/quadro, conteúdo com responsável e prazo, aprovação manual, importação/exportação e registro de resultado manual. Integrações de publicação e analytics ficam fora do primeiro MVP até validação de permissões e custo.
