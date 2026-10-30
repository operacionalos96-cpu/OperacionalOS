/**
 * Palavras do dia a dia do app, definidas UMA vez (o que não é número calculado — números ficam em
 * src/lib/domain/metrics.ts). Aparecem no painel "Como usar" de cada página.
 * Regra de escrita: frase curta, sem jargão, como se explicasse para alguém que nunca usou o app.
 */
export const GLOSSARY = {
  lead: {
    term: "Lead",
    meaning: "Uma pessoa ou empresa com quem você está tentando fechar negócio.",
  },
  etapa: {
    term: "Etapa",
    meaning: "Em que ponto a conversa está: Novo, Contato feito, Proposta, Negociação, Ganho ou Perdido.",
  },
  "proxima-acao": {
    term: "Próxima ação",
    meaning: "O próximo passo combinado com o lead e a data. Todo lead em andamento precisa ter uma.",
  },
  "lead-parado": {
    term: "Lead parado",
    meaning: "Lead em andamento sem nenhuma novidade há 7 dias ou mais. Vale retomar o contato.",
  },
  descartado: {
    term: "Descartado",
    meaning: "Empresa que não vale chamar agora. Sai das listas, mas o motivo fica guardado para aprender.",
  },
  previsto: {
    term: "Previsto",
    meaning: "Conta que ainda vai ser paga ou recebida. Não muda o saldo até acontecer.",
  },
  realizado: {
    term: "Realizado",
    meaning: "Dinheiro que já entrou ou já saiu de verdade. Só isso conta no saldo.",
  },
  baixa: {
    term: "Dar baixa",
    meaning: "Avisar que uma conta prevista foi paga ou recebida. A partir daí ela conta no saldo.",
  },
  "nivel-acesso": {
    term: "Nível de acesso",
    meaning: "O que cada pessoa pode fazer: Visualizador só vê; Colaborador cria e edita; Gestão também muda configurações; Founder controla tudo.",
  },
  hipotese: {
    term: "Hipótese",
    meaning: "Uma sugestão de melhoria feita a partir do que aconteceu. Só vira regra se uma pessoa aprovar.",
  },
} as const satisfies Record<string, { term: string; meaning: string }>

export type TermId = keyof typeof GLOSSARY
