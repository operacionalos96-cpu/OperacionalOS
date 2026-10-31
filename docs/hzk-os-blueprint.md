# HZK OS — Blueprint do Operacional

> 30/10/2026 · @Igor. Especificação do HZK OS, transcrita do PDF "HZK OS — Blueprint do Operacional".
> O plano de como encaixar isto no que já existe está em [`plano-implementacao.md`](plano-implementacao.md).

## Visão e princípios

O HZK OS é o sistema único da empresa: cada tarefa, ideia, roteiro, decisão e post vive aqui, tem um
dono e um próximo passo. Ele não copia nenhuma ferramenta. Pega o mecanismo que faz cada sistema de
elite funcionar e encaixa no tamanho da HZK (CEO + 2 founders + time, coprodução, Instagram).

| Sistema de referência | O mecanismo que funciona | Como entra no HZK OS |
|---|---|---|
| Sunsama | Ritual guiado de 10–15 min para planejar o dia, aviso de sobrecarga e ritual de fechamento | Planejar amanhã (noite anterior) e Fechar o dia, com aviso quando o plano passa das horas disponíveis |
| Linear | Triagem: tudo que chega cai numa caixa de entrada antes do fluxo; ciclos curtos em que o que não terminou rola para o próximo | Caixa de entrada única + roteamento por área; semana como ciclo, com rollover automático |
| Basecamp | Check-ins automáticos assíncronos no lugar de reunião de status; progresso por confiança (hill chart) | Check-ins ("o que fiz hoje / foco da semana") que alimentam a visão do time, sem ligação |
| Shape Up (Basecamp) | Ideia grande vira um pitch com apetite (quanto tempo ela vale) antes de virar trabalho | Ideias grandes viram Pitch e passam por aprovação antes de virar projeto |
| Amazon (porta de mão única / dupla) + DACI | Decisão reversível é tomada rápido por quem está perto; decisão irreversível tem dono da aprovação explícito | Decisões: reversível = o dono da área decide; irreversível ou financeira = vai para a CEO |
| Notion / Figma | Documento vivo com comentário ancorado no trecho e status de revisão | Roteiros e documentos com comentários no trecho, versão e botão de aprovar/pedir ajuste |
| Superhuman / Linear | Captura e navegação em um atalho (⌘K) | Captura rápida global: tarefa, ideia ou nota em 2 segundos, de qualquer tela |

### Cinco regras do HZK OS

1. **Uma fonte da verdade.** Cada coisa existe uma vez; as telas são só filtros dela (isso acaba com a repetição do Início).
2. **Tudo tem dono e próximo passo.** Item sem dono fica na caixa de entrada até alguém triar.
3. **Assíncrono por padrão.** Check-in, comentário e aprovação no lugar de ligação.
4. **Rituais curtos.** Planejar e fechar o dia em menos de 10 minutos.
5. **O Início guia o dia.** Ele responde: onde preciso estar, o que preciso entregar, o que está travando alguém.

### Mapa do sistema

Todo o OS gira em torno de um item único: a captura cria, a triagem dá dono pela área, os rituais
planejam, e cada tela só mostra um recorte dele.

## Início: Meu Dia

O Início deixa de ter duas listas e passa a ter uma única lista do dia, montada na ordem em que a
pessoa pensa. "Precisa da sua atenção" vira selo dentro da lista, não uma seção separada.

Ordem dos blocos (de cima para baixo):

1. **Cabeçalho do dia:** saudação, data, frase de foco (vem do Planejar amanhã) e um botão "Planejar meu dia" se a pessoa ainda não planejou.
2. **Nota da noite anterior:** o que a própria pessoa escreveu ontem para ler hoje de manhã (ver Rituais).
3. **Agenda de hoje:** linha do tempo com os compromissos do Google Calendar e os blocos de foco. Marca "agora" na linha.
4. **Time agora:** um avatar por pessoa com status ao vivo: no PC / em reunião / compromisso / offline, e até que horas.
5. **Plano do dia:** a lista única, em três grupos: Atrasado, Hoje, Se sobrar tempo. Cada item mostra área, tempo estimado e selos: *aguardando você*, *bloqueado*, *precisa de decisão*, *para aprovar*. A soma das horas aparece no topo, com aviso se passar do disponível na agenda.
6. **Esperando por você:** aprovações de roteiro, pedidos de revisão e menções. Para a CEO, aparece aqui também o bloco Decisões pendentes com aprovar/recusar/pedir mais contexto direto no card.
7. **Conteúdo de hoje:** posts agendados para o dia (status: pronto / falta arte / falta legenda) e posts publicados há 1 ou 7 dias sem métrica.
8. **Caixa de entrada (contador):** itens capturados que ainda não têm dono ou data. Clique leva à triagem.

O que sai da tela: a seção "Minhas atividades" atual (vira o Plano do dia) e a seção "Itens que
precisam da sua atenção" (vira selos + Esperando por você).

**Regra de ouro:** um item nunca aparece em dois blocos. Se está no Plano do dia, não aparece em
Esperando por você, e vice-versa.

## Rituais

Três rituais curtos substituem as ligações de alinhamento: fechar o dia (e planejar amanhã), o
check-in semanal e a triagem.

**Fechar o dia + Planejar amanhã** (fim do expediente, ~5 min, guiado em 4 telas):

1. **O que você concluiu:** a lista do dia com check; o que ficou aberto pede uma escolha: amanhã, outro dia ou soltar.
2. **Monte o amanhã:** puxa o que rolou, o que vence amanhã e o que está na caixa de entrada. A pessoa arrasta para o plano e estima o tempo. O sistema compara com a agenda de amanhã e avisa se passou.
3. **Foco de amanhã:** uma frase ("fechar o roteiro do lançamento") que vira o cabeçalho do Início.
4. **Nota para amanhã:** texto livre que aparece no topo do Início na manhã seguinte.

Quem não fechou o dia vê, ao abrir o OS de manhã, o mesmo fluxo em versão "Planejar hoje".

**Check-in semanal** (segunda de manhã e sexta à tarde, assíncrono):

- Segunda: "qual o seu foco da semana?" (até 3 itens).
- Sexta: "o que saiu, o que travou, o que precisa de alguém?"
- As respostas aparecem juntas numa página **Semana do time**. É a reunião de status, sem reunião.

**Triagem da caixa de entrada** (diária, 5 min): tudo que foi capturado sem dono ou sem data cai na
caixa de entrada. A triagem decide: virar tarefa (com área e dono), virar ideia, virar decisão, ou
arquivar. Item parado mais de 48 h na caixa ganha selo de alerta.

## Pessoas, áreas e decisões

Cada área da HZK tem um dono, e é a área que decide para onde vai uma tarefa. Quem cria a tarefa
escolhe a área; o OS atribui ao dono automaticamente. A divisão abaixo é uma proposta inicial para
ajustar (Founder A e B a definir).

| Área | Dono | Apoio | Quem aprova |
|---|---|---|---|
| Financeiro (caixa, pagamentos, repasses de coprodução) | CEO | — | CEO |
| Contratos e jurídico | CEO | Founder do parceiro | CEO |
| Estratégia, metas e prioridades do trimestre | CEO | Founders | CEO |
| Pessoas (contratação, rotina do time) | CEO | Founders | CEO |
| Conteúdo HZK e marca (Instagram) | Founder A | Time | Founder A |
| Roteiros e posicionamento | Founder A | Founder B | Founder A (+ revisão do outro founder) |
| Comercial e novos coprodutores | Founder B | Founder A | Founder B; contrato vai para CEO |
| Lançamentos e operação dos coproduzidos | Founder B | Time | Founder B |
| Tráfego, funis e dados | Founder B | Time | Founder B; verba vai para CEO |

Pendências: definir quem é Founder A e Founder B e ajustar a tabela; definir o limite em R$ a partir
do qual um gasto vai para a CEO.

**Tarefa × Decisão**

- **Tarefa** = algo a fazer, com dono, prazo e área.
- **Decisão** = algo a escolher. Tem: pergunta, contexto, opções, recomendação de quem propõe, prazo, decisor, resultado e motivo. Fica registrada no Histórico de decisões.

**Regra de roteamento das decisões** (porta de mão dupla × porta de mão única):

1. Reversível e dentro da área → o dono da área decide sozinho e só registra.
2. Envolve dinheiro acima do limite, contrato, contratação ou mudança de estratégia → vai para a CEO.
3. Afeta a área do outro founder → o outro founder precisa dar ok antes.
4. Decisão sem resposta no prazo ganha selo vermelho no Início do decisor.

**Página de cada pessoa:** áreas que ela possui, tarefas em andamento, decisões esperando por ela,
foco da semana (check-in) e agenda de hoje. É o que tira a necessidade de ligação para saber o
andamento.

## Ideias, brainstorming e aprovações

Um módulo novo, **Ideias & Docs**, é onde a empresa pensa junta: capturar, discutir, aprovar e
transformar em trabalho.

1. **Captura rápida (⌘K / botão +):** de qualquer tela, escolher Tarefa, Ideia, Nota ou Decisão, digitar uma linha e salvar. Vai para a caixa de entrada de quem capturou.
2. **Mural de ideias:** cada ideia tem título, descrição, tipo (negócio, conteúdo, produto, processo), autor e reações do time (👍 / "quero discutir"). Ideias com mais votos sobem. Botões: virar tarefa, virar pauta de conteúdo, virar pitch.
3. **Sessão de brainstorming:** uma sala com tema, prazo e participantes. Fase 1: cada um joga ideias sem ver as dos outros (evita efeito manada). Fase 2: todas aparecem, o time agrupa e vota. Fase 3: as escolhidas viram tarefas ou pitches com dono. Opcional: botão "IA, sugira mais 10 ângulos" usando o contexto da HZK.
4. **Pitch (para ideias grandes):** modelo fixo: problema, ideia, apetite (quanto tempo/dinheiro vale), riscos, o que fica de fora. Vai para aprovação conforme a regra de decisões.
5. **Documentos e roteiros com aprovação:** editor de texto rico (roteiro, briefing, proposta). Comentários presos ao trecho selecionado. Botão Enviar para aprovação: escolhe aprovadores (ex.: outro founder + time), cada um responde Aprovar / Pedir ajuste com comentário. O status aparece no doc e no Início dos aprovadores. Cada envio salva uma versão, para comparar o antes e depois. Status de um documento: Rascunho → Em revisão → Ajustes pedidos → Aprovado → Arquivado.
6. **Notificações:** menção (@nome), pedido de aprovação e decisão pendente geram notificação dentro do OS e aparecem em Esperando por você. E-mail ou WhatsApp fica para uma fase posterior.

## Conteúdo HZK

A aba Conteúdo vira o ciclo completo de um post, do sinal de mercado à métrica, em quatro sub-abas.
Canal único por enquanto: Instagram (o modelo já aceita outros canais depois).

Fluxo de um post: **Ideia → Roteiro → Em aprovação → Produção → Agendado → Publicado → Medido**

1. **Radar (notícias do mercado):** fontes em RSS escolhidas pelo time, cada uma ligada a um pilar: IA, marketing, founder-led growth, coprodução/infoprodutos, negócios. Uma rotina diária (cron no Supabase) busca as novidades, e a API do Claude resume cada uma em 2 linhas + "ângulo para a HZK" (como isso vira conteúdo para empresários). Cada notícia tem: Salvar, Descartar, Virar pauta (cria a ideia já com o link e o ângulo). Toda segunda, um "Resumo da semana" com os 5 temas mais quentes.
2. **Pautas (banco de ideias de conteúdo):** campos: título, pilar, formato (reels, carrossel, estático, stories, live), gancho, CTA, fonte (link do Radar, se veio de lá), responsável, status. Visão em quadro (kanban) pelo fluxo acima. O roteiro é um documento do módulo Ideias & Docs, com o mesmo fluxo de aprovação.
3. **Calendário:** visão mês e semana. Arrastar uma pauta para um dia agenda o post. Cada post agendado é enviado para a agenda Conteúdo HZK no Google Calendar (o OS manda, o Google só mostra). Cores por pilar, para ver o equilíbrio do mês.
4. **Desempenho:** por post: alcance, visualizações, curtidas, comentários, compartilhamentos, salvamentos, seguidores ganhos; taxa de engajamento = (curtidas + comentários + compartilhamentos + salvamentos) ÷ alcance. Coleta em D+1 e D+7 (dois retratos do mesmo post). Fase 1: preenchimento manual, com lembrete no Início. Fase 2: busca automática pela API do Instagram. Painel: média por pilar e por formato, top 5 posts do mês, e qual pilar está abaixo da média. É isso que responde "o que devemos postar mais?".

Pendências: listar as fontes de notícia que já acompanham (sites, newsletters, perfis); confirmar os
pilares de conteúdo e os formatos usados.

## Integrações

| Integração | Para quê | Como | Cuidado principal |
|---|---|---|---|
| Google Calendar (rotina do time) | Status ao vivo de cada pessoa e agenda no Início | Cada pessoa conecta o próprio Gmail (OAuth). O OS lê só livre/ocupado (FreeBusy) da agenda pessoal, e eventos completos só de uma agenda "Trabalho" que a pessoa escolher | Com Gmail pessoal, o app no Google Cloud fica "Externo". Em modo Teste, o token expira em 7 dias e o limite é 100 usuários (Nango). Para não reconectar toda semana: publicar o app (Produção) e aceitar a tela "app não verificado", já que é uso interno |
| Google Calendar (Conteúdo HZK) | Ver os posts no Google | Uma agenda "Conteúdo HZK" na conta da empresa, compartilhada com o time. O OS cria/atualiza/apaga o evento quando o post muda | Sincronização de mão única (OS → Google). Guardar o `google_event_id` em cada post |
| Instagram | Métricas automáticas por post (fase 2) | Instagram API com login do Instagram (conta Profissional/Criador). Endpoint de insights por mídia | Desde 2025 os insights estão disponíveis nessa API (Meta). Métrica de stories só fica disponível por 24 h, e mídias dentro de carrossel não têm insights individuais (Meta) |
| API do Claude | Resumo do Radar, ângulos de conteúdo, sugestões no brainstorming | Chamadas server-side (Edge Function ou rota do Next.js) | Chave só no servidor; limite de chamadas por dia |

**Segurança:** tokens do Google e do Instagram ficam criptografados no Supabase (Vault ou coluna
criptografada), nunca no navegador. Toda tabela com RLS (cada um vê o próprio token; dados da empresa
visíveis para todos do time).

## Modelo de dados (Supabase)

O modelo gira em torno de uma ideia: **item é a fonte única** (tarefa, ideia, decisão, nota), e as
telas são filtros dele. Antes de criar tabelas novas, o Claude Code deve mapear o que já existe e
reaproveitar.

| Tabela | Campos principais | Observação |
|---|---|---|
| profiles | id, nome, cargo (CEO / founder / time), avatar, horas_disponíveis_dia | Liga ao auth do Supabase |
| areas | id, nome, dono_id, apoio_ids, aprovador_id, descrição | Base do roteamento |
| items | id, tipo (task / idea / decision / note), título, corpo, área_id, dono_id, criador_id, status, prioridade, prazo, planejado_para (data), estimativa_min, ordem, origem | Fonte única do Início e da caixa de entrada |
| decisions | item_id, contexto, opções (jsonb), recomendação, decisor_id, tipo_porta (reversível / irreversível), resultado, motivo, decidido_em | Extensão 1-para-1 de items |
| daily_plans | user_id, data, foco, nota_para_amanhã, fechado_em | Rituais de planejar/fechar |
| checkins | user_id, semana, tipo (segunda / sexta), respostas (jsonb) | Página Semana do time |
| docs + doc_versions | id, título, conteúdo (jsonb do editor), status, autor_id / versão, snapshot | Roteiros, pitches, briefings |
| approvals | doc_id, versão, aprovador_id, resposta, comentário | Fluxo de aprovação |
| comments | entidade, entidade_id, trecho (âncora), autor_id, corpo, resolvido | Serve para docs, itens e posts |
| brainstorms + brainstorm_ideas + votes | tema, fase, prazo / texto, autor / usuário, voto | Sessões de brainstorming |
| news_sources + news_items | url, pilar, ativa / título, link, resumo, ângulo, status | Radar |
| content_posts | id, pauta_item_id, doc_id (roteiro), pilar, formato, legenda, status, agendado_para, publicado_em, ig_media_id, google_event_id, responsável_id | Calendário |
| post_metrics | post_id, coletado_em, marco (D+1 / D+7), alcance, views, curtidas, comentários, compart., salvamentos, seguidores, origem (manual / api) | Desempenho |
| integrations | user_id, provedor, tokens (criptografados), escopos, expira_em | Google e Instagram |
| availability_cache | user_id, início, fim, status | Cache do FreeBusy para o "Time agora" |
| notifications | user_id, tipo, entidade, lida | Esperando por você |

## Roadmap

Oito prompts, um por fase, mandados em ordem; cada fase só começa depois de testar a anterior.

| Fase | Entrega | Depende de |
|---|---|---|
| 0 | Auditoria do projeto e plano (sem código) | — |
| 1 | Áreas, pessoas, item único, decisões, captura rápida, caixa de entrada | 0 |
| 2 | Início Meu Dia + rituais | 1 |
| 3 | Google Calendar (time + Conteúdo HZK) | 2 |
| 4 | Ideias & Docs: mural, brainstorming, roteiros com aprovação | 1 |
| 5 | Conteúdo: pautas, calendário, desempenho manual | 3, 4 |
| 6 | Radar de notícias com IA | 5 |
| 7 | Métricas automáticas do Instagram | 5 |

### Prompt 0 — Auditoria

Leia `docs/hzk-os-blueprint.md` inteiro. Ele é a especificação do HZK OS. NÃO escreva código nesta etapa.

1. Mapeie o projeto atual: stack (confirme Next.js + Supabase), estrutura de pastas, rotas/abas existentes, componentes de UI, tabelas e policies RLS do Supabase, autenticação.
2. Compare com o blueprint: o que já existe e pode ser reaproveitado, o que precisa mudar, o que é novo. Atenção à aba Início: explique por que hoje "itens que precisam da sua atenção" e "minhas atividades" repetem itens.
3. Proponha o plano das fases 1 a 7 com: migrations, rotas, componentes e riscos.
4. Liste perguntas que precisam da minha resposta antes da fase 1.

Salve o resultado em `docs/plano-implementacao.md` e me mostre um resumo.

### Prompt 1 — Fundação: pessoas, áreas e item único

Implemente a FASE 1 (seções "Pessoas, áreas e decisões" e "Modelo de dados"), seguindo `docs/plano-implementacao.md`.

- Migrations: profiles (cargo: ceo/founder/time), areas (dono, apoio, aprovador), items (tipo task/idea/decision/note, fonte única), decisions, notifications. Se já existe tabela de tarefas, migre os dados para items sem perder nada.
- RLS em todas as tabelas.
- Seed das áreas com a tabela de proposta do blueprint (deixe os donos editáveis numa tela de Configurações > Áreas).
- Roteamento: ao criar item com área, dono = dono da área (editável).
- Decisões: formulário com pergunta, contexto, opções, recomendação, prazo, tipo de porta. Regra de roteamento do blueprint (financeiro/contrato/contratação/estratégia ou acima do limite em R$ → CEO). Tela Histórico de decisões.
- Captura rápida global (atalho Cmd/Ctrl+K e botão +): tarefa, ideia, nota ou decisão em uma linha.
- Caixa de entrada: itens sem dono ou sem data; ações de triagem (virar tarefa com área, ideia, decisão, arquivar); selo de alerta após 48 h.
- Página de cada pessoa: áreas, tarefas em andamento, decisões esperando por ela.

Ao final: rode o build e os testes, e liste como testar manualmente.

### Prompt 2 — Início Meu Dia + rituais

Implemente a FASE 2 (seções "Início: Meu Dia" e "Rituais").

- Refaça a aba Início na ordem exata dos 8 blocos. Remova "minhas atividades" e "itens que precisam da sua atenção" como seções; tudo vem de items com filtros. Regra: um item nunca aparece em dois blocos.
- Plano do dia em 3 grupos (Atrasado, Hoje, Se sobrar tempo), arrastar para reordenar, soma de horas com aviso de sobrecarga.
- Selos: aguardando você, bloqueado, precisa de decisão, para aprovar.
- Bloco Decisões pendentes só para quem é decisor, com aprovar/recusar/pedir contexto no card.
- Agenda e "Time agora" ficam como placeholders bem desenhados (a fase 3 liga o Google).
- Ritual Fechar o dia + Planejar amanhã (4 telas), tabela daily_plans, nota para amanhã no topo do Início, e versão "Planejar hoje" para quem não fechou.
- Check-in semanal (segunda: foco; sexta: saiu/travou/precisa) e página Semana do time.

Design: limpo, calmo, legível em 10 segundos; mobile funcional. Rode build e testes no final.

### Prompt 3 — Google Calendar

Implemente a FASE 3 (seção "Integrações").

- OAuth Google por usuário (contas Gmail pessoais, app Externo). Escopos mínimos: calendar.freebusy + calendar.events só para a agenda escolhida. Tokens criptografados em integrations, renovação automática, tela para conectar/desconectar.
- Passo a passo do Google Cloud Console, incluindo publicar o app em Produção para o token não expirar em 7 dias.
- Rotina do time: cron (a cada 10 min) busca FreeBusy de todos e grava em availability_cache; o bloco "Time agora" mostra no PC / em reunião / compromisso / offline e até que horas. Eventos com título "Foco" ou "Trabalhando" = no PC.
- Agenda de hoje no Início com os eventos da própria pessoa.
- Agenda "Conteúdo HZK": sincronização de mão única OS → Google. Preparar a função `syncPostToCalendar(post)` com `google_event_id` (usada na fase 5).
- Tratar erros de token expirado mostrando "reconectar Google" no Início.

### Prompt 4 — Ideias & Docs

Implemente a FASE 4 (seção "Ideias, brainstorming e aprovações").

- Mural de ideias com reações, ordenação por votos e ações: virar tarefa, virar pauta de conteúdo, virar pitch.
- Sessão de brainstorming em 3 fases (ideias às cegas → revelar, agrupar e votar → escolher e atribuir dono). Botão opcional "IA, sugira mais 10 ângulos" chamando a API do Claude no servidor.
- Pitch com modelo fixo (problema, ideia, apetite, riscos, fora do escopo), roteado pela regra de decisões.
- Docs com editor rico (sugestão: Tiptap), comentários ancorados no trecho, versões, e "Enviar para aprovação" com aprovadores múltiplos (Aprovar / Pedir ajuste). Status: Rascunho, Em revisão, Ajustes pedidos, Aprovado, Arquivado.
- Menções @nome e pedidos de aprovação geram notifications e aparecem em "Esperando por você" no Início.

### Prompt 5 — Conteúdo: pautas, calendário, desempenho

Implemente a FASE 5 (seção "Conteúdo HZK"), reaproveitando a aba Conteúdo que já existe.

- Sub-abas: Radar (placeholder), Pautas, Calendário, Desempenho.
- Pautas em kanban pelo fluxo Ideia → Roteiro → Em aprovação → Produção → Agendado → Publicado → Medido. Roteiro = doc da fase 4 com aprovação.
- Calendário mês/semana, arrastar pauta para agendar, cores por pilar, e chamada de `syncPostToCalendar` ao criar/mover/apagar.
- Desempenho: formulário de métricas em D+1 e D+7 (post_metrics), taxa de engajamento = (curtidas+comentários+compart.+salvamentos)/alcance, lembrete no Início para posts sem métrica, painel por pilar e formato e top 5 do mês.
- Canal: só Instagram por enquanto, mas com campo canal no modelo.

### Prompt 6 — Radar de notícias

Implemente a FASE 6 (Radar).

- Tela de fontes (news_sources) com URL de RSS e pilar: IA, marketing, founder-led growth, coprodução/infoprodutos, negócios.
- Cron diário (Edge Function) que busca itens novos, remove duplicados e chama a API do Claude para gerar: resumo em 2 linhas + "ângulo para a HZK" (conteúdo para empresários). Prompt do Claude configurável numa tela.
- Feed com filtro por pilar e ações Salvar, Descartar, Virar pauta (cria pauta com link e ângulo).
- Resumo da semana toda segunda com os 5 temas mais quentes.

### Prompt 7 — Métricas automáticas do Instagram

Implemente a FASE 7.

- Instagram API com login do Instagram (conta Profissional). Passo a passo do app na Meta.
- Ligar cada content_post ao ig_media_id (listar mídias recentes e sugerir o casamento por data/legenda).
- Cron em D+1 e D+7 que busca insights de mídia e grava em post_metrics com origem = api, sem apagar o que foi preenchido à mão.
- Tratar limitações: stories só por 24 h, sem insight individual para mídia dentro de carrossel, métricas ausentes vêm vazias (não zero).

## Fontes

- Sunsama — Daily planning and shutdown
- Linear Method e Linear — Triage
- Basecamp — Shape Up
- Meta — Instagram Media Insights e anúncio dos insights no login do Instagram
- Nango — Google Calendar OAuth (modo teste e expiração de token)
