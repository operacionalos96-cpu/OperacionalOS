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
  status: {
    term: "Status",
    meaning: "Onde a pessoa está agora: ausente, em reunião, em compromisso, em foco (pela agenda), online (com o app aberto), no expediente (fez check-in) ou offline.",
  },
  "check-in": {
    term: "Check-in",
    meaning: "Um botão no guia do dia, com o foco de hoje se quiser. Assim o time sabe que você está trabalhando, mesmo com o app fechado, até você fechar o dia.",
  },
  "guia-do-dia": {
    term: "Guia do dia",
    meaning: "A bolinha com a marca HZK no canto da tela. Ao abrir o app no dia, ela mostra o check-in e por onde começar: atrasadas, decisões, reuniões e tarefas de hoje, e o que virou o que você anotou ontem.",
  },
  "caixa-de-entrada": {
    term: "Caixa de entrada",
    meaning: "Onde cai tudo o que foi capturado e ainda não tem destino. Fica ali até alguém triar.",
  },
  area: {
    term: "Área",
    meaning: "Parte da empresa com um dono (ex.: Comercial). Ao escolher a área, a tarefa vai para o dono dela.",
  },
  decisao: {
    term: "Decisão",
    meaning: "Algo a escolher (tarefa é algo a fazer). Tem pergunta, opções, quem decide e o motivo da escolha.",
  },
  porta: {
    term: "Dá para desfazer?",
    meaning: "Decisão fácil de desfazer o dono da área toma rápido. Difícil de desfazer, ou com contrato, contratação ou estratégia, vai para a CEO.",
  },
  hipotese: {
    term: "Hipótese",
    meaning: "Uma sugestão de melhoria feita a partir do que aconteceu. Só vira regra se uma pessoa aprovar.",
  },
} as const satisfies Record<string, { term: string; meaning: string }>

export type TermId = keyof typeof GLOSSARY
