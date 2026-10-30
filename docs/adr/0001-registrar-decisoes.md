# 0001. Registrar decisões de arquitetura em ADRs

- **Status:** Aceito
- **Data:** 2026-10-30

## Contexto

O projeto é desenvolvido por mais de uma pessoa, e com ajuda de IA. As decisões estruturais (como
os dados são guardados, onde fica cada regra, quem pode o quê) estavam espalhadas em relatórios
datados em `docs/` e em conversas. Quem chega não sabe o que ainda vale e o que já foi superado.

## Decisão

Vamos registrar cada decisão estrutural em `docs/adr/`, no formato de Michael Nygard ("Documenting
Architecture Decisions", 2011): Contexto, Decisão, Consequências. Um ADR aceito não é reescrito;
uma mudança de rumo vira um ADR novo que substitui o anterior.

`docs/ARQUITETURA.md` continua sendo o guia prático ("como faço X"). Os ADRs explicam o "por quê".

## Consequências

- Qualquer pessoa entende por que o sistema é assim sem depender de quem decidiu.
- Toda mudança estrutural passa a ter um custo pequeno: escrever uma página no PR.
- Os relatórios antigos em `docs/` ficam como histórico; o que vale está nos ADRs e em `ARQUITETURA.md`.
