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

O sistema não define nem armazena uma senha temporária. Se o e-mail já estiver em `public.members` ou já existir no Supabase Auth, a API retorna um erro e não cria uma segunda associação automaticamente; verifique o usuário existente antes de tentar novamente.

## Segurança

- Apenas membros ativos com nível `owner` ou `admin` podem convidar.
- A rota não permite criar novos `owner` pela interface.
- `SUPABASE_SECRET_KEY` nunca deve ser colocada em `NEXT_PUBLIC_*`, commitada no repositório ou enviada ao navegador.
