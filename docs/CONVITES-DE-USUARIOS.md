# Convites de usuários do OperacionalOS

O cadastro de novos usuários agora passa pela rota de servidor `POST /api/equipe/convites`. Ela valida a sessão e o nível `owner`/`admin`, cria o convite pelo Supabase Auth e registra o e-mail na tabela `public.members` com o nível de acesso escolhido. A chave privilegiada do Supabase é usada somente no servidor.

## Configuração necessária

1. Na Vercel, configure `SUPABASE_SECRET_KEY` como variável de ambiente **sem** o prefixo `NEXT_PUBLIC_`. Use a Secret key do projeto Supabase; nunca a exponha no navegador.
2. Confirme que `APP_URL` aponta para a URL pública correta do OperacionalOS (por exemplo, `https://operacional-os.vercel.app`).
3. No Supabase, em **Authentication → URL Configuration**, inclua a URL pública do app na lista de Redirect URLs. O convite redireciona para `/auth/confirm?next=/redefinir-senha`.
4. Confirme a configuração de envio de e-mails do Supabase Auth. Se usar SMTP próprio, teste o template de convite.
5. Faça deploy/redeploy depois de configurar as variáveis.

## Convidar Rafael Freitas

1. Entre no OperacionalOS com uma conta `owner` ou `admin`.
2. Abra **Equipe & Cargos → Adicionar Membro**.
3. Informe `Rafael Freitas`, `freitassrafa2006@gmail.com` e selecione **Gestão Executiva / admin**.
4. Envie o convite. Rafael receberá um e-mail para confirmar o acesso e definir a própria senha em `/redefinir-senha`.

## Convidar Iole (CEO e CFO)

O perfil dela já está pronto no sistema: só falta o e-mail.

1. Entre com uma conta `owner` e abra **Equipe → Adicionar membro**.
2. Preencha:
   - **E-mail:** o dela;
   - **Nome:** `Iole`;
   - **Nível:** **Gestão Executiva** (`admin`);
   - **Cargos:** marque **CEO** primeiro (vira o principal) e depois **CFO**.
3. Envie. Ela recebe o e-mail, define a senha em `/redefinir-senha` e entra.
4. Em **Equipe → Cargos e funções**, tire o cargo **CFO** do Gabriel: a partir daqui só a Iole tem.

Com o cargo CEO, ela vira dona sozinha das áreas da CEO (Financeiro, Contratos e jurídico, Estratégia
e metas, Pessoas). Ninguém precisa reatribuir nada: o que hoje cai na caixa de entrada por falta de
CEO passa a ir para ela.

### O que ela vê no menu

Ajustado à mão em **Configurações → O que cada um vê** (ADR 0012). O padrão das áreas dela também
traria Mapas; o ajuste tira. A Início aparece para todo mundo e não desliga.

| Aba | Para que ela usa |
| --- | --- |
| Início | Plano do dia, check-in e o próximo passo de cada setor |
| Agenda | Reuniões e prazos do time |
| Caixa de entrada | O que foi capturado e ainda não tem destino |
| Tarefas & Notas | As tarefas dela e as notas da equipe |
| Decisões | Decide o que é dela: dinheiro acima do limite, contratos, contratação e estratégia |
| Equipe | Acompanha o que cada um tem e o que fez |
| Financeiro | Entradas, saídas, contas a pagar e a receber, meta do mês |
| Metas | As metas da empresa e o progresso delas |
| Configurações | Dono de cada área e o limite de gasto que vai para ela |

Ela **não** vê Prospecção, Pipeline, Clientes, Produtos, Conteúdos, Mapas, AI Office e Cofre (o Cofre é só para `owner`).

### Roteiro do onboarding (30 min)

1. **Entrar:** abrir o e-mail do convite, definir a senha, entrar.
2. **Início:** fazer o primeiro check-in pela bolinha do guia e montar o plano do dia.
3. **Configurações:** conferir as áreas dela e definir o **limite de gasto** que precisa da CEO.
4. **Decisões:** abrir uma decisão de exemplo e escolher uma opção direto no card.
5. **Financeiro:** registrar uma entrada, uma conta a pagar e dar baixa.
6. **Equipe:** ver as responsabilidades de cada um e responder o foco da semana.

Cada página tem o botão **Como usar** com os passos dela.

O sistema não define nem armazena uma senha temporária. Se o e-mail já estiver em `public.members` ou já existir no Supabase Auth, a API retorna um erro e não cria uma segunda associação automaticamente; verifique o usuário existente antes de tentar novamente.

## Segurança

- Apenas membros ativos com nível `owner` ou `admin` podem convidar.
- A rota não permite criar novos `owner` pela interface.
- `SUPABASE_SECRET_KEY` nunca deve ser colocada em `NEXT_PUBLIC_*`, commitada no repositório ou enviada ao navegador.
