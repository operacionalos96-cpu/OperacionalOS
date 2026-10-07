// Escolhe os achados do vídeo e escreve as frases. Puro (testado em selecionar.test.mjs).
// As frases só descrevem o que foi medido na página — nada de "você está perdendo clientes".

const FAMILIA = { contato_no_fim: 'contato', sem_whatsapp: 'contato' };

function frase(a) {
  switch (a.kind) {
    case 'copyright_antigo':
      return { text: `o rodapé do site ainda mostra © ${a.ano}`, short: `Rodapé com © ${a.ano}` };
    case 'contato_no_fim':
      return { text: 'o contato só aparece depois de rolar boa parte da página', short: 'Contato só no fim da página' };
    case 'sem_whatsapp':
      return { text: 'não há um botão de WhatsApp para chamar a empresa direto pelo site', short: 'Sem botão de WhatsApp' };
    case 'servicos_sem_explicacao': {
      const nome = a.nome || 'serviços';
      return { text: `os ${nome} aparecem só como uma lista de nomes, sem explicar o que cada um resolve`, short: `${nome[0].toUpperCase()}${nome.slice(1)} sem explicação` };
    }
    case 'topo_sem_proposta':
      return /^(seja )?bem[- ]vind/i.test(a.titulo || '')
        ? { text: `o maior texto do topo é "${a.titulo}", sem dizer o que a empresa faz`, short: 'Topo sem proposta clara' }
        : { text: `o maior texto do topo é só "${a.titulo}", sem dizer o que a empresa faz`, short: 'Topo sem proposta clara' };
    case 'nao_responsivo':
      return { text: 'no celular, a página fica mais larga que a tela e precisa de zoom para ler', short: 'Não adaptado ao celular' };
    case 'sem_prova_social':
      return { text: 'o site não mostra depoimentos ou avaliações de clientes', short: 'Sem depoimentos de clientes' };
    case 'sem_https':
      return { text: 'o site ainda abre sem o cadeado de segurança (https)', short: 'Site sem https' };
    default:
      return null;
  }
}

/** Área do destaque com folga, dentro da página (o vídeo dá zoom nela). */
function foco(area, largura = 1440) {
  if (!area) return null;
  const pad = 24;
  const x = Math.max(0, area.x - pad);
  const y = Math.max(0, area.y - pad);
  const w = Math.min(largura - x, area.w + pad * 2);
  const h = Math.max(200, area.h + pad * 2);
  return [x, y, w, h];
}

/** Até 2 achados, mais fortes primeiro, sem dois do mesmo assunto. */
function escolherAchados(achados, max = 2) {
  const usados = new Set();
  const out = [];
  for (const a of [...achados].sort((x, y) => y.prioridade - x.prioridade)) {
    const fam = FAMILIA[a.kind] || a.kind;
    if (usados.has(fam)) continue;
    const f = frase(a);
    if (!f) continue;
    usados.add(fam);
    const print = a.kind === 'nao_responsivo' ? 'mobile.png' : a.area ? 'pagina.png' : 'home.png';
    out.push({ kind: a.kind, ...f, print, foco: foco(a.area), evidencia: a.evidencia || '' });
    if (out.length >= max) break;
  }
  return out;
}

module.exports = { escolherAchados, frase, foco };
