# 0025. Contratos: cadastro, arquivo privado e aviso de vencimento

- **Status:** Proposto
- **Data:** 2026-11-24

## Contexto

O app já guardava tarefas com prazo, decisões com motivo e notas, mas não tinha onde guardar os
contratos: o arquivo assinado, com quem é, quanto vale e até quando. Só existia a área "Contratos
e jurídico" (dona: CEO) e a regra de que decisão com contrato vai para ela. O único espaço de
arquivos era o bucket `conteudos`, que todo membro lê — inadequado para contrato.

## Decisão

1. **Tabela `contracts`** no padrão dos módulos (`id` + `data jsonb`, migration 0029), registrada em
   `src/lib/modules.ts`: carregar, salvar e tempo real vêm de `createCollection`.
2. **Quem lê e grava é a área, não uma regra nova.** As políticas usam `private.can_read_area('contratos')`
   e `private.can_write_area('contratos')` (ADR 0020). Marcar a área como restrita em Equipe › Acesso
   por área fecha a tabela **e** os arquivos para quem não recebeu acesso. A tela repete a mesma
   regra (`areaLevel`) só para explicar; quem decide é o banco.
3. **Bucket `contratos` próprio e privado**, com as mesmas políticas da área, só PDF, .docx, PNG e
   JPG, até 20 MB. Sem política de `update`: versão nova é arquivo novo. Links assinados de 10 min.
4. **A situação não é guardada**: rascunho, vigente, vence em breve, vencido e encerrado saem das
   datas (`contractStatus`), então não existe contrato "vigente" no banco que já venceu.
5. **Vencimento aparece onde o time já olha:** na Agenda (fonte nova em `agendaEntries`) e no selo
   do menu. A tarefa de renovação é criada por um clique, na área de Contratos, e o contrato guarda
   o id dela para não criar duas.
6. **Página `/contratos`** no grupo Gestão, visível por padrão para quem é da área de Contratos
   (`AREA_PAGES`) e para o owner.
7. **Deploy antes da migration não quebra o app:** se a tabela ainda não existe, só a página
   Contratos avisa; o resto abre sem o alerta "Algum módulo não carregou".

## Por quê

- **Menor privilégio** (Saltzer e Schroeder, *The Protection of Information in Computer Systems*,
  1975): contrato é dado sensível; o acesso sai do mesmo mecanismo das outras áreas, no banco, em
  vez de uma checagem na tela.
- **Estado derivado em vez de guardado** evita duas fontes para a mesma informação (Hunt e Thomas,
  *The Pragmatic Programmer*, 1999, DRY): a data é a fonte; a situação é cálculo.
- **Uma regra de acesso, um lugar** (Parnas, *On the Criteria To Be Used in Decomposing Systems
  into Modules*, 1972): quem muda a política de áreas não precisa lembrar dos contratos.

## Consequências

- Enquanto a área "Contratos e jurídico" **não** for marcada como restrita, todo membro ativo lê os
  contratos (é o comportamento padrão das áreas). Para restringir, um founder liga a chave em
  Equipe › Acesso por área.
- A tarefa de renovação não é automática: alguém da área clica. Criar sozinho exigiria rodar no
  servidor (fila do ADR 0006) para não duplicar entre navegadores; fica para depois, se fizer falta.
- A ligação com cliente e produto é um campo do contrato, não uma relação do painel "Conexões":
  o contrato não entra nas buscas e painéis das outras entidades, de propósito.
- Apagar um contrato apaga os arquivos dele; não há lixeira.
- A demonstração local (sandbox) não guarda arquivos.
