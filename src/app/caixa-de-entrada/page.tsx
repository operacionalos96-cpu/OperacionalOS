import { redirect } from "next/navigation"

/**
 * A Caixa de entrada mora em Tarefas (aba Entrada): capturar, triar e fazer ficam no mesmo lugar.
 * Este endereço só redireciona, para os links antigos continuarem funcionando.
 */
export default function InboxRedirect() {
  redirect("/tarefas?aba=entrada")
}
