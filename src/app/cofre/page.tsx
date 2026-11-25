import { redirect } from "next/navigation"

/**
 * O Cofre mora em Configurações (aba Cofre). Este endereço só redireciona, para que exista UMA tela
 * de cofre para manter e os links antigos continuem funcionando.
 */
export default function CofreRedirect() {
  redirect("/configuracoes?aba=cofre")
}
