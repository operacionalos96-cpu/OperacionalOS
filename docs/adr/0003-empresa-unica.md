# 0003. Sistema de uma empresa só (sem multiempresa)

- **Status:** Aceito
- **Data:** 2026-10-30

## Contexto

Um sistema multiempresa (multi-tenant) precisa de um identificador da empresa em toda tabela e de
isolamento no banco. É uma decisão cara de adiar, porque migrar depois mexe em todos os dados. A
pergunta foi feita explicitamente aos sócios.

## Decisão

O Operacional OS é **só da HZK Company**. Não haverá `workspace_id` nem isolamento entre empresas.
O controle de acesso é por **pessoa e cargo** (owner, admin, operator, viewer), dentro da mesma
empresa.

## Consequências

- O modelo de dados e as regras de acesso ficam bem mais simples.
- Se um dia o sistema virar produto vendido para outras empresas, esta decisão precisa ser
  substituída por um ADR novo, com plano de migração: coluna de empresa em cada tabela, RLS por
  empresa e separação de arquivos.
- Funcionalidades pensadas para clientes externos (portal do cliente, por exemplo) devem ser
  desenhadas como acesso limitado *dentro* da HZK, não como empresas separadas.
