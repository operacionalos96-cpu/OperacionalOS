import { redirect } from "next/navigation"

/**
 * O Cofre mora em /cofre (é o endereço do menu). Esta rota era uma cópia idêntica da página;
 * agora só redireciona, para que exista UMA tela de cofre para manter (links antigos continuam
 * funcionando).
 */
export default function EquipeCofreRedirect() {
  redirect("/cofre")
}
