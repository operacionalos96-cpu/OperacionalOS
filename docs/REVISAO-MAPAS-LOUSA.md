# Revisão técnica — Mapas e Lousa

## Escopo desta revisão

Esta entrega parte do `mapas-lousa.zip` recebido e preserva o editor existente. As mudanças são incrementais; não substituem uma validação no navegador com Supabase configurado.

## O que o código oferece após esta revisão

- **Lousa livre:** mantém nós de ideias, grupos, texto solto, desenho, ferramentas de camada, conexões, desfazer/refazer e modo foco; adiciona formas, imagens, minimapa e importação/exportação JSON.
- **Imagens:** o usuário pode escolher um arquivo, arrastar uma imagem para a lousa ou colar uma imagem da área de transferência. O arquivo é enviado ao bucket privado `conteudos` na pasta `anexos/map-image/...`; o nó guarda o caminho de armazenamento, não a URL assinada temporária. Ao abrir o mapa, o componente solicita uma nova URL assinada e a renova enquanto o editor fica aberto. A origem do Supabase foi incluída em `img-src` da CSP para que o navegador possa exibir o arquivo privado.
- **Formas:** retângulo, elipse e losango são nós que podem ser editados, redimensionados e conectados.
- **Mapa estruturado:** modo separado da lousa, com ferramentas de decoração ocultas e foco em nós de ideias/grupos e conexões. Ambos os modos operam sobre o mesmo mapa e os mesmos dados; alternar não duplica nem migra o conteúdo.
- **Exportar/importar:** exporta um JSON com título, nós e conexões. A importação valida os campos essenciais e se as conexões apontam para nós existentes antes de substituir o conteúdo do mapa aberto. Os caminhos de imagens são referências ao mesmo bucket Supabase, não arquivos incorporados no JSON.
- **Vínculos:** o painel existente de nós suporta tarefas, leads, produtos, conteúdo, notas, mapas e metas. Não foi criada uma tabela nova de vínculos.

## Persistência e segurança — avaliação da base atual

- `supabase/migrations/0005_mapas_por_no.sql` cria `map_nodes` e `map_edges`, com um registro por nó/conexão, ativa RLS, revoga acesso de `anon` e limita leitura/escrita a membros autenticados via `private.is_member()`.
- A migração adiciona essas tabelas à publicação `supabase_realtime`; `src/lib/repositories/supabase.ts` assina mudanças Postgres e `src/lib/collection-store.ts` aplica eventos às coleções locais.
- O editor usa `useMapSync` para gravar diferenças por nó/conexão e aplicar alterações remotas. Isso reduz colisões entre edições em nós diferentes.
- **Limite importante:** não há resolução explícita de conflitos nem interface para escolher entre versões. Se duas pessoas editarem o mesmo nó ao mesmo tempo, a edição local ainda não salva pode prevalecer e sobrescrever a remota. Portanto, a base oferece sincronização em tempo real, mas ainda não garante colaboração sem perda de edição.
- O bucket `conteudos` é privado e as políticas existentes autorizam membros autenticados. O caminho de imagem é persistido; o JSON exportado não transporta os bytes da imagem. Excluir nós não remove automaticamente os arquivos do Storage, evitando que desfazer/edições remotas apaguem arquivos em uso; isso pode deixar anexos órfãos e merece uma rotina de limpeza futura.
- O tamanho máximo do arquivo segue o limite já configurado no bucket (50 MB). Para uma experiência de produto mais segura, recomenda-se reduzir o limite de imagem e incluir confirmação ao substituir o mapa durante uma importação.

## Critérios de aceite

- [ ] Abrir um mapa antigo e confirmar que os nós e conexões continuam visíveis.
- [ ] Na lousa, criar texto, desenho, grupo, forma e imagem; mover, redimensionar, conectar e apagar itens.
- [ ] Colar uma imagem, arrastar um arquivo de imagem e escolher uma imagem pelo seletor.
- [ ] Aguardar o salvamento automático, recarregar a página e confirmar a recuperação de cada tipo de item.
- [ ] Alternar para Mapa estruturado: conferir que ideias/grupos/conexões continuam editáveis e que texto solto, desenhos, formas e imagens não poluem a visão estruturada; voltar à lousa e confirmar que os elementos decorativos continuam intactos.
- [ ] Exportar JSON, importar em um mapa de teste e conferir nós/conexões. Testar também JSON inválido e conexão para nó inexistente.
- [ ] Com duas sessões autenticadas, editar nós diferentes e depois o mesmo nó; registrar o comportamento e não declarar conflito resolvido até haver política e teste específicos.
- [ ] Validar RLS e acesso ao Storage com usuário membro e usuário não autorizado num ambiente de teste.

## Etapas recomendadas

1. **Validação funcional local:** executar os fluxos acima com Supabase de desenvolvimento configurado.
2. **Validação de persistência:** recarregar, testar dados antigos, falhas de rede e URLs assinadas expiradas.
3. **Colaboração:** criar testes de concorrência para edições no mesmo nó/conexão; definir se a política será last-write-wins, aviso de conflito ou controle otimista por versão.
4. **Robustez:** validar tamanho/tipo de imagem, JSON grande ou malformado, limpeza de anexos órfãos e acessibilidade por teclado.
5. **Aceite HZK:** comparar os critérios com a seção 4.1 original. O arquivo dessa seção não estava presente no ZIP recebido, então essa conferência documental continua pendente.

## Validação realizada nesta sessão

- Foi feita análise estática do código e das migrações relacionadas.
- A sintaxe TypeScript/JSX dos arquivos alterados foi verificada com o transpiler TypeScript global.
- **Build, lint, testes Vitest e testes no navegador não foram executados:** a instalação das dependências não concluiu no ambiente desta sessão. Não considerar a entrega aprovada até executar esses comandos no ambiente do projeto.
