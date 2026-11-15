# Abre cada tela da vitrine uma vez, para o servidor de desenvolvimento deixar todas montadas.
# Sem isso, o primeiro clique em cada tela demora alguns segundos.
$base = "http://localhost:3040"
$telas = @(
  "/", "/agenda", "/caixa-de-entrada", "/tarefas", "/pipeline", "/prospeccao", "/clientes", "/produtos",
  "/conteudos", "/mapas", "/metas", "/decisoes", "/financeiro", "/equipe", "/cofre", "/configuracoes",
  "/ai-office", "/dock", "/dock/bots", "/dock/apps", "/dock/skills", "/dock/provedores", "/dock/uso",
  "/dock/rotinas", "/dock/pc"
)
$n = 0
foreach ($t in $telas) {
  $n++
  Write-Host ("  {0}/{1} {2}" -f $n, $telas.Count, $t)
  try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 120 ($base + $t) | Out-Null } catch { Write-Host "    (nao respondeu)" }
}
