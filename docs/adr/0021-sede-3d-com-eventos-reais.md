# 0021. Sede 3D: os eventos reais viram pacotes viajando pelo prédio

- **Status:** Proposto
- **Data:** 2026-11-10

## Contexto

O IA Office ganhou um visual 3D da sede da HZK. É um prédio em corte com 4 andares e cobertura, robôs em escala humana e cabos com pulsos de dados. O desenho e o plano estão na nota 20 do Obsidian, e o protótipo aprovado está em `docs/prototipos/ia-office-sede.html`.

A etapa 5 do plano pede que **um lead real vire um pacote viajando**.

Fatos do código que pesaram:

- **Eventos já existem:** o app já registra cada passo do lead na tabela `events` (ADR do AI Office, SQL 0010): `lead.created`, `lead.analyzed`, `lead.approved`, `lead.contacted`… O `useEventFeed` entrega esses eventos ao vivo, inclusive os do sócio, por tempo real.
- **A CSP bloqueia o protótipo como está:** o `next.config.ts` só aceita scripts do próprio site (`script-src 'self'`) e proíbe o app dentro de outra página (`frame-ancestors 'none'`). O protótipo, que carrega o three.js de um CDN, não pode entrar por iframe nem com os scripts de fora.

## Decisão

1. **A cena entra no app como componente:** `three@0.160.0` vira dependência do projeto, servido pelo próprio site, então a CSP não muda. A aba "Sede 3D" do AI Office monta a cena com `import()` dinâmico, e o three.js só é baixado quando a aba abre. A primeira carga de `/ai-office` continua igual.
2. **Tradução pura e testada:** `src/lib/domain/office-scene.ts` (`sceneActionFor`) transforma um evento em uma ação da cena. A cena só desenha o que essa função manda. Mapa:
   - **Lead chega ao funil:** cadastrado, respondeu ou demonstrou interesse.
   - **Funil para análise:** analisado. O robô fica com o "!" esperando decisão.
   - **"!" resolvido:** aprovado mostra o ✓; descartado só apaga o "!".
   - **Mensagem sai do funil pela cobertura:** contato ou mensagem do funil.
   - **Funil para produção:** proposta.
   - **Venda:** virou cliente faz a entrega sair pela produção, e só a venda acende o painel da HZK.
   - **Perdido:** o pacote apaga.
   - **Agentes:** `agent.*` aparecem no andar do trabalho de cada um; uma falha fica com contorno vermelho.
3. **Sem reencenar o passado:** a cena só encena eventos que chegam depois que ela abriu (`freshForScene`), um por vez. Uma rajada (por exemplo, importar 200 leads) guarda os 12 mais novos e avisa quantos foram resumidos (`enqueueScene`).
4. **Neutralidade de conteúdo:** a cena não mostra nome de cliente, valor nem mensagem. O nome do lead aparece só no registro lateral, que já é visível para quem tem acesso ao AI Office. Os andares não têm rótulo; o andar indica o tipo de trabalho.
5. **Demonstração:** o botão "Demonstração" encena uma jornada inteira **sem gravar nada**, para mostrar o prédio quando o dia está parado.

## Consequências

- **Peso:** +1 dependência (~600 kB, baixada só na aba). A cena tem cerca de 100 mil triângulos por quadro; o quadro que atualiza as sombras (a cada 2 quadros) chega a cerca de 450 mil. Ela pausa com a aba escondida e mantém o teto de ~30 quadros por segundo.
- **Novos tipos de evento:** um tipo novo (por exemplo, produção de site) entra numa linha do `switch` e num teste. A cena não muda.
- **Permissões:** a vitrine (ver o movimento sem o conteúdo) e o acesso por área (ADR 0020, PRs #39 e #40) ainda não filtram a cena. Hoje ela mostra o que o feed de eventos já mostra para quem abre o AI Office. Quando o acesso por área entrar, o filtro deve ser aplicado no feed, antes da tradução.
- **Teste no navegador:** `?raf=timeout` existe só fora de produção, para testar com o painel do navegador escondido (que congela o `requestAnimationFrame`).
