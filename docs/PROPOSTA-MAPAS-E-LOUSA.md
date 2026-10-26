# Proposta de evolução — Mapas e Lousa

## Objetivo

Reunir dois modos de trabalho sem confundir seus propósitos:
- **Lousa livre:** espaço amplo para texto solto, desenho manual, imagens e organização visual.
- **Mapa estruturado:** hierarquia de ideias, conexões explícitas, relações e visualização em lista.

A interface atual já utiliza React Flow, inclui texto/desenho e oferece uma visão em lista. Esta entrega inicial torna os modos mais claros e melhora o contraste das conexões, preservando a arquitetura existente.

## Melhorias iniciais aplicadas

- Nomes de navegação mais claros: “Lousa livre” e “Mapa estruturado”.
- Conexões padrão mais visíveis, com largura e contraste reforçados; relações especiais continuam diferenciadas por traço.
- Texto de estado de salvamento mais explícito.
- Persistência existente mantida: `map_nodes` / `map_edges`, com migração compatível com mapas antigos.

## Vínculos com tarefas e projetos

A arquitetura já trata mapas e nós como entidades e contempla vínculos com tarefas, leads e outras entidades. A evolução deve privilegiar o registro de relações existente e evitar campos paralelos quando uma relação genérica resolver o caso.

## Recuperação e segurança dos dados

- Manter o salvamento incremental por nó/aresta e a sincronização em tempo real existente.
- Preservar a migração de mapas antigos e o JSON legado como cópia de segurança.
- Testar criação, edição, exclusão com desfazer, recarga e reconexão após falha de rede.
- Validar permissões no Supabase/RLS antes de habilitar compartilhamento adicional.

## Colaboração simultânea — evolução planejada

Não presumir que a experiência de colaboração está completa só porque existe sincronização em tempo real por nó/aresta. Antes de anunciá-la como recurso final, avaliar:
1. conflitos de edição simultânea e estratégia de resolução;
2. presença de participantes, cursores e seleção remota;
3. autorização por mapa e isolamento entre equipes;
4. reconexão, eventos duplicados, ordenação e edição offline;
5. limites de carga e testes com vários participantes.

## Etapas sugeridas

1. **Fundação e UX:** revisar responsividade, atalhos, contraste, seleção, zoom e navegação entre modos.
2. **Funcionalidade:** validar imagens, desenho, texto, conexões e modelos; preencher lacunas com testes.
3. **Integrações:** reforçar vínculos com tarefas/projetos usando entidades e relações já existentes.
4. **Persistência e recuperação:** testes de migração, salvamento incremental, desfazer/refazer e falhas de conexão.
5. **Colaboração:** avaliação técnica e protótipo isolado antes de prometer colaboração simultânea.
6. **Entrega:** testes automatizados, lint, build e checklist de regressão.

## Limites desta entrega

Esta proposta não declara colaboração simultânea nova nem alterações de banco. A implementação completa depende de executar testes no ambiente do projeto e revisar as políticas e migrações reais do Supabase. O briefing “HZK | OperacionalOS, seção 4.1” não estava presente no ZIP recebido; revisar esse documento antes de fechar o escopo.
