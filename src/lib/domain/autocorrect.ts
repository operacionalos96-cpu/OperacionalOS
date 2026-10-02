/**
 * Corretor automático (pt-BR) — regras puras, testadas em autocorrect.test.ts.
 *
 * Só corrige o que não tem dúvida: acentos esquecidos ("nao" → "não") e finais
 * "-cao/-coes/-sao" ("acao" → "ação"). Palavras que mudam de sentido com ou sem
 * acento (e/é, esta/está, da/dá, pais/país…) ficam como estão; para essas, o
 * sublinhado do navegador (spellCheck) ajuda.
 */

const WORDS: Record<string, string> = Object.fromEntries(
  (
    "nao:não naos:nãos voce:você voces:vocês tambem:também entao:então ja:já alem:além porem:porém ate:até apos:após atraves:através " +
    "mes:mês tres:três ultimo:último ultima:última ultimos:últimos ultimas:últimas otimo:ótimo otima:ótima minimo:mínimo minima:mínima " +
    "maximo:máximo maxima:máxima proximo:próximo proxima:próxima proximos:próximos proximas:próximas rapido:rápido rapida:rápida " +
    "facil:fácil faceis:fáceis dificil:difícil dificeis:difíceis possivel:possível possiveis:possíveis impossivel:impossível " +
    "disponivel:disponível responsavel:responsável responsaveis:responsáveis estrategia:estratégia estrategias:estratégias " +
    "negocio:negócio negocios:negócios conteudo:conteúdo conteudos:conteúdos video:vídeo videos:vídeos midia:mídia midias:mídias " +
    "pagina:página paginas:páginas analises:análises metrica:métrica metricas:métricas grafico:gráfico graficos:gráficos " +
    "publicos:públicos horario:horário horarios:horários usuario:usuário usuarios:usuários numero:número numeros:números " +
    "codigo:código codigos:códigos unico:único unica:única logica:lógica tecnico:técnico tecnica:técnica organico:orgânico organica:orgânica " +
    "trafego:tráfego orcamento:orçamento orcamentos:orçamentos preco:preço precos:preços servico:serviço servicos:serviços " +
    "comecar:começar comeco:começo lancar:lançar lancamento:lançamento lancamentos:lançamentos area:área areas:áreas agencia:agência agencias:agências experiencia:experiência " +
    "audiencia:audiência frequencia:frequência sequencia:sequência referencia:referência referencias:referências concorrencia:concorrência " +
    "historia:história historias:histórias historico:histórico funcionario:funcionário funcionarios:funcionários calendario:calendário " +
    "diario:diário relatorio:relatório relatorios:relatórios necessario:necessário necessaria:necessária obrigatorio:obrigatório " +
    "automatico:automático automatica:automática titulo:título titulos:títulos topico:tópico topicos:tópicos basico:básico basica:básica " +
    "especifico:específico especifica:específica credito:crédito debito:débito juridico:jurídico fisico:físico financas:finanças " +
    "cobranca:cobrança seguranca:segurança mudanca:mudança mudancas:mudanças lideranca:liderança confianca:confiança " +
    "avancar:avançar alcancar:alcançar praca:praça saude:saúde agua:água aplicacao:aplicação sao:são " +
    "periodo:período periodos:períodos indice:índice indices:índices " +
    "inicio:início duvidas:dúvidas proposito:propósito simbolo:símbolo " +
    "publico-alvo:público-alvo pos-venda:pós-venda pre-venda:pré-venda"
  )
    .split(" ")
    .map((pair) => pair.split(":") as [string, string]),
)

/** Final "-cao"/"-coes" depois de vogal e "-sao"/"-soes" depois de i/u/r/n/l/s (decisão, versão, missão). */
const ENDINGS: [RegExp, string][] = [
  [/([aeiou])cao$/, "$1ção"],
  [/([aeiou])coes$/, "$1ções"],
  [/([iurnls])sao$/, "$1são"],
  [/([iurnls])soes$/, "$1sões"],
]

/** Mantém maiúsculas: "Nao" → "Não", "NAO" → "NÃO". */
function matchCase(original: string, fixed: string) {
  if (original === original.toUpperCase() && original !== original.toLowerCase() && original.length > 1) return fixed.toUpperCase()
  if (original[0] === original[0].toUpperCase() && original[0] !== original[0].toLowerCase()) return fixed[0].toUpperCase() + fixed.slice(1)
  return fixed
}

/** Uma palavra corrigida (ou a mesma, se não houver certeza). */
export function correctWord(word: string): string {
  const lower = word.toLowerCase()
  if (lower.length < 2 || /[^a-z-]/.test(lower)) return word // já tem acento, número ou símbolo: não mexe
  const direct = WORDS[lower]
  if (direct) return direct === lower ? word : matchCase(word, direct)
  if (lower.length >= 4)
    for (const [re, to] of ENDINGS) if (re.test(lower)) return matchCase(word, lower.replace(re, to))
  return word
}

const WORD = /[A-Za-zÀ-ÿ-]+/g

/** Texto inteiro corrigido (ao terminar de editar). Links e e-mails ficam intactos. */
export function correctText(text: string): string {
  return text
    .split(/(\s+)/)
    .map((chunk) => (/[/@.:]\S/.test(chunk) || /^https?:/i.test(chunk) ? chunk : chunk.replace(WORD, correctWord)))
    .join("")
}

/**
 * Enquanto digita: quando a última tecla fecha uma palavra (espaço, pontuação,
 * quebra de linha), corrige a palavra que acabou de ser escrita.
 * Devolve o texto novo e onde o cursor deve ficar.
 */
export function correctWhileTyping(prev: string, next: string, caret: number): { text: string; caret: number } {
  if (next.length !== prev.length + 1 || caret < 2) return { text: next, caret }
  const typed = next[caret - 1]
  if (!/[\s.,;:!?)]/.test(typed)) return { text: next, caret }
  const before = next.slice(0, caret - 1)
  const m = /([A-Za-zÀ-ÿ-]+)$/.exec(before)
  if (!m) return { text: next, caret }
  // Parte de link/e-mail: não mexe.
  const token = /(\S+)$/.exec(before)?.[1] ?? ""
  if (/[/@:]/.test(token) || /\.\w/.test(token)) return { text: next, caret }
  const fixed = correctWord(m[1])
  if (fixed === m[1]) return { text: next, caret }
  const start = before.length - m[1].length
  const text = next.slice(0, start) + fixed + next.slice(caret - 1)
  return { text, caret: caret + fixed.length - m[1].length }
}
