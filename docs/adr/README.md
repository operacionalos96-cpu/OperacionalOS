# Decisões de arquitetura (ADRs)

Cada arquivo registra **uma** decisão que afeta a estrutura do sistema: o contexto, o que foi
decidido e as consequências (boas e ruins). Formato de Michael Nygard, "Documenting Architecture
Decisions" (2011).

Por que existe: daqui a seis meses ninguém lembra *por que* algo é do jeito que é. O ADR responde
isso sem depender de quem estava na conversa, e evita que uma decisão seja desfeita sem querer.

## Como usar

- Decisão nova = arquivo novo `NNNN-titulo-curto.md` (próximo número), copiando `0000-modelo.md`.
- ADR aceito **não é editado**. Mudou de ideia? Escreva um novo e marque o antigo como
  "Substituído por NNNN".
- Escreva no PR junto com o código que aplica a decisão.

## Índice

| Nº | Decisão | Status |
|---|---|---|
| [0001](0001-registrar-decisoes.md) | Registrar decisões de arquitetura em ADRs | Aceito |
| [0002](0002-camadas.md) | Camadas: domínio puro, serviços, infraestrutura, interface | Aceito |
| [0003](0003-empresa-unica.md) | Sistema de uma empresa só (sem multiempresa) | Aceito |
| [0004](0004-banco-compartilhado.md) | Banco Supabase compartilhado com outros apps | Aceito (provisório) |
| [0005](0005-autorizacao-no-banco.md) | Autorização por cargo aplicada no banco | Aceito |
| [0006](0006-automacoes-no-servidor.md) | Fatos de negócio no servidor: Outbox + consumidor idempotente | Aceito |
| [0007](0007-frontend-modular.md) | Frontend guiado, uma fonte só para cada informação, rumo a apps independentes | Aceito |
| [0008](0008-item-unico.md) | Item único do HZK OS guardado na tabela de tarefas | Aceito |
| [0009](0009-presenca-do-time.md) | Presença do time: agenda, app aberto e check-in do dia | Aceito |
| [0010](0010-meu-dia.md) | Meu Dia: uma lista do dia, "fazendo agora", daily e agenda | Aceito |
| [0011](0011-check-in-semanal.md) | Check-in semanal e Semana do time | Aceito |
