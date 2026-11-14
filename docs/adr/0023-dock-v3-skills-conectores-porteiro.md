# 0023. Dock v3: skills, conectores e porteiro sobre o escritório pessoal

- **Status:** Proposto
- **Data:** 2026-11-13

## Contexto

O escritório pessoal (ADR 0022) tem bots, conversas, tarefas e conexões de IA. O Dock v3 acrescenta
skills da empresa, apps e conectores, nível de acesso por bot, avatar, troca de IA por conversa e rotinas.
O protótipo foi aprovado pelo Gabriel em 13/11/2026. A primeira leva sai só com os níveis 0 e 1 (Gabriel, 14/11/2026).

Fatos que pesaram:

- **O escritório é privado.** Só o dono lê `office_*`, nem founder. Skills e conectores são da empresa:
  alguém além do dono precisa ler e aprovar.
- **Acesso por área já existe** (ADR 0020): `area_access`, `can_read_area`, `area_level`.
- **O maior perigo é o bot ser enganado** por um texto que ele leu (nota 26 do vault). O que o bot lê é
  informação, nunca ordem.
- **Três tipos de IA** (pesquisa F2): API compatível com OpenAI, API nativa da Anthropic e programas de
  agente por ACP. A skill precisa funcionar nos três.
- **Segredo nunca vai ao servidor** (ADR 0022): chaves e tokens ficam no PC.
- **A Anthropic não permite** oferecer o login do claude.ai em produto de terceiro sem aprovação.

## Decisão

1. **Duas famílias de tabela.** `office_*` continua "só o dono lê". As tabelas novas da empresa são
   `dock_*`, com leitura por área ou por cargo. Uma skill pessoal e uma da área ficam na mesma tabela
   (`dock_skills`), separadas por um `scope` obrigatório e por um check.
2. **O navegador só escreve por funções**, como na 0026. As funções do motor são liberadas só para
   `service_role`, atrás de `/api/workers`.
3. **A skill fica presa ao bot e funciona com qualquer IA.** Cada versão é imutável. O motor entrega o
   pacote como pasta de skills (programas ACP) ou como instruções e uma ferramenta `skill_ler` (APIs).
4. **A skill evolui como a memória HZK:** aprendizado candidato (pessoal) → sinal (só o padrão, enviado
   pela pessoa) → proposta → aprovação do responsável da área → versão nova. Nada muda sozinho.
5. **Versão nova entra com aviso, a não ser que peça mais poder.** Se pedir mais nível, conector ou
   script, espera o dono. Quem quiser fixa a versão.
6. **Catálogo de conectores curado por founder,** com pacote e lista de ferramentas presos por hash.
   Cada ação tem classe A–D. Ferramenta sem classe não existe para o bot.
7. **Porteiro no banco.** Toda ação em coisa da empresa passa por `office_request_action` antes de
   acontecer, inclusive leitura. A e B seguem; C e D viram aprovação. A origem é calculada pelo
   servidor. O registro (`dock_action_log`) é só de acréscimo e não guarda conversa.
8. **A ação aprovada é executada pelo motor a partir do rascunho guardado,** sem passar pela IA.
9. **"Sempre permitir" só para classe C,** por bot e por ação, só em pedido da própria pessoa, com
   validade de 90 dias.
10. **Nível 0–3 por bot, padrão 0.** O número de anéis do avatar é o nível. O nível vale no PC só
    depois de confirmado na janela do app.
11. **O banco nunca diz ao PC que programa rodar.** O comando de um programa ACP fica no PC. A chave
    de IA fica presa ao endereço confirmado no PC.
12. **Founder classifica o que cada provedor faz com os dados.** Provedor que treina com o conteúdo
    não recebe dado da empresa.
13. **Levas:** primeira, chaves e IA local; segunda, ACP. Claude por assinatura não é oferecido.

## Alternativas consideradas

- **Skill presa à IA** (cada provedor com o seu formato). Rejeitada: trocar a IA do bot perderia a
  skill, e o Gabriel pediu cobertura para os dois.
- **Skills pessoais em tabelas `office_*` separadas.** Mais isolamento, mas duplicaria versões,
  instalação e proposta. Ficou uma tabela só, com `scope` obrigatório, check e teste de RLS.
- **Porteiro só no motor.** Rejeitada: a regra da empresa fica no servidor (nota 26, princípio 2).
- **Só C e D passarem pelo servidor, e A e B em resumo no fim.** Mais leve, mas o porteiro deixaria de
  ver a leitura na hora e não conseguiria negar leitura a um provedor que treina com os dados.
- **Guardar o token do conector no servidor** (como a `ai_connection_secrets` do desenho antigo).
  Rejeitada: contraria a ADR 0022 e concentraria os tokens de todos num lugar só.
- **Deixar a IA executar a ação depois de aprovada.** Rejeitada: a IA poderia executar algo diferente
  do que a pessoa aprovou.
- **Catálogo aberto de conectores.** Rejeitada: conector é o jeito mais fácil de enganar um bot.
- **Atualização de skill sempre automática.** Rejeitada: uma versão nova poderia pedir mais poder sem
  ninguém ver.

## Consequências

- **Mais fácil:** pessoa nova instala o Kit da área e trabalha no padrão dos colegas. Trocar de IA não
  perde nada. Todo ato de bot na empresa tem autoria e aprovação registradas.
- **Mais difícil:** cada conector novo exige um founder classificar ação por ação. Um conector que
  atualiza sai do ar até a nova aprovação.
- **Custo:** toda ação de conector da empresa faz uma chamada ao servidor. Limite inicial de 60 por
  minuto por bot.
- **Riscos aceitos:**
  - nos níveis 2 e 3, e em programas ACP, um bot pode usar o login que a pessoa já tem no PC para
    alcançar sistemas da empresa fora do porteiro. Reduzido por ambiente limpo e lista de confirmação;
    fecha só com a área isolada do nível 2;
  - para sistemas de fora (GitHub, Figma), o porteiro decide, mas quem executa é o motor no PC;
  - o texto que a pessoa digita vai para o provedor que ela escolheu; o porteiro não lê conversas;
  - um founder sozinho aprova um conector (decisão pendente).
- **Exceção ao "só o dono lê":** aprovação que exige founder (dinheiro) aparece para os founders. O
  registro de ações aparece para founders e para quem gere a área, sem conversa.
- **Testes:** a migration 0027 roda no Postgres de teste com todas as anteriores, e `src/lib/server/dock.rls.test.ts`
  confere RLS com quatro papéis (dono, colega da área, colega de fora, founder), o porteiro e o "sempre permitir".
- **Depois:** `claim_next_job` respeitando a
  suspensão; `office-state/v2` com nível e avatar; catálogo de provedores com fonte e data; conferir a
  documentação do ACP e de cada programa antes da segunda leva.
