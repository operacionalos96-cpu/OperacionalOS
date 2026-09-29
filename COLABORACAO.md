# Como trabalhar em dupla no OperacionalOS

## Toda vez que for começar a trabalhar
```bash
git pull
```
Isso traz o que o sócio subiu. Se o `package.json` mudou, rode também `npm install`.

Para rodar o projeto: `npm run dev` e abra http://localhost:3000

## Quando terminar uma alteração
```bash
git add .
git commit -m "descreva o que mudou"
git pull
git push
```

## Regras simples
1. **Sempre `git pull` antes de começar e antes de `git push`.**
2. Faça commits pequenos e frequentes.
3. Combinem quem mexe em qual arquivo para evitar conflito.
4. Nunca suba senhas ou chaves (arquivo `.env` já é ignorado).

## Se der conflito
O Git marca o trecho no arquivo com `<<<<<<<`, `=======` e `>>>>>>>`.
Escolha o que fica, apague as marcações, depois:
```bash
git add .
git commit -m "resolve conflito"
git push
```
