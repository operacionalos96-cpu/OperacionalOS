// Escolhe os 3 pontos do vídeo e escreve as frases. Puro (testado em selecionar.test.mjs).
// Só entram pontos que pesam na decisão de quem está conhecendo a empresa — e que foram MEDIDOS.
// As frases descrevem o que foi visto; o "impacto" explica por que importa, sem prometer nem acusar.

const MINIMO = 3;

// Pontos do mesmo assunto não aparecem juntos (o vídeo precisa de 3 argumentos diferentes).
const FAMILIA = { contato_no_fim: 'contato', sem_whatsapp: 'contato', sem_cta_topo: 'contato', titulo_generico: 'busca', titulo_so_nome: 'busca', sem_descricao: 'busca' };

// Cada ponto fala do CLIENTE do empresário (quem chega, confia, pede orçamento), não de peças do site.
// Teste do dono: se a frase serviria para qualquer site, ou só um técnico vê valor nela, não entra no vídeo.
// Por isso título/descrição do Google, quantidade de palavras e ano do rodapé não são argumento (devolvem null).
function frase(a) {
  switch (a.kind) {
    case 'nao_responsivo':
      return {
        text: 'no celular, a página fica mais larga que a tela: para ler, o cliente precisa dar zoom e arrastar para o lado',
        short: 'No celular, o cliente precisa dar zoom',
        impacto: 'Quem abre pelo celular encontra uma página que dá trabalho, e o próximo resultado da busca está a um toque.',
      };
    case 'subdominio_gratuito':
      return {
        text: `o endereço que vocês passam para os clientes é ${a.host}, de site gratuito`,
        short: 'Endereço de site gratuito',
        impacto: 'Para quem recebe o link, parece empresa provisória, o oposto do que vocês já construíram.',
      };
    case 'topo_sem_proposta':
      return {
        text: a.soNome || (a.titulo && !/^(seja )?bem[- ]vind/i.test(a.titulo) && a.titulo.split(' ').length <= 5)
          ? `quem chega vê só "${a.titulo}" na primeira tela, sem saber o que vocês resolvem nem para quem`
          : a.titulo && /^(seja )?bem[- ]vind/i.test(a.titulo)
          ? `quem chega lê "${a.titulo}" na primeira tela, sem saber o que vocês resolvem nem para quem`
          : 'quem chega não descobre na primeira tela o que vocês resolvem nem para quem',
        short: 'Quem chega não sabe o que vocês fazem',
        impacto: 'É nesses primeiros segundos que o cliente decide se está no lugar certo ou volta para a busca.',
      };
    case 'servicos_sem_explicacao': {
      const nome = a.nome || 'serviços';
      return {
        text: `os ${nome} aparecem só como nomes; quem tem o problema não encontra ali o que resolve o caso dele`,
        short: 'Cliente não vê o que pode contratar',
        impacto: 'Quem chega com uma necessidade não se reconhece nos nomes e sai sem pedir orçamento.',
      };
    }
    case 'contato_no_fim':
      return {
        text: 'para chamar vocês, o cliente precisa rolar boa parte da página até achar o contato',
        short: 'Difícil chamar vocês',
        impacto: 'O cliente que já quer orçamento precisa procurar como falar com vocês.',
      };
    case 'sem_cta_topo':
      return {
        text: 'na primeira tela não há nenhum botão para pedir orçamento ou chamar a empresa',
        short: 'Nenhum botão para pedir orçamento',
        impacto: 'Quem já chega decidido precisa procurar o próximo passo.',
      };
    case 'sem_whatsapp':
      return {
        text: 'não há um botão de WhatsApp: quem quer conversar agora precisa copiar o número ou preencher formulário',
        short: 'Sem atalho para o WhatsApp',
        impacto: 'O cliente que quer resolver rápido encontra um passo a mais justamente na hora de chamar.',
      };
    case 'sem_localizacao':
      return {
        text: 'o site não diz em que cidade ou região vocês atendem',
        short: 'Cliente não sabe se vocês atendem ele',
        impacto: 'Quem procura alguém perto fica sem saber se vale a pena chamar vocês.',
      };
    case 'sem_autoridade':
      return {
        text: 'o site não mostra a experiência, a formação ou a trajetória por trás da empresa',
        short: 'A experiência de vocês não aparece',
        impacto: 'Quem ainda não conhece vocês não encontra o motivo para confiar na empresa.',
      };
    case 'sem_prova_social':
      return {
        text: 'em nenhum lugar do site um cliente conta como foi contratar vocês',
        short: 'Nenhum cliente falando por vocês',
        impacto: 'Quem está decidindo não encontra ninguém que já contratou e aprovou.',
      };
    case 'lento':
      return {
        text: `no nosso teste, o site levou ${a.segundos} segundos para aparecer`,
        short: 'Cliente espera o site abrir',
        impacto: 'Quem clicou na busca passa esses segundos olhando uma tela vazia.',
      };
    case 'sem_https':
      return {
        text: 'ao abrir o site, o navegador mostra o aviso "Não seguro" ao lado do endereço',
        short: 'Navegador avisa "Não seguro"',
        impacto: 'É o primeiro recado que o cliente lê, antes mesmo do nome da empresa.',
      };
    // Pontos de técnico, não de dono: ficam como fato medido para o analista, nunca no vídeo.
    case 'pouco_conteudo':
    case 'titulo_generico':
    case 'titulo_so_nome':
    case 'sem_descricao':
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

/** Os 3 pontos mais fortes, sem dois do mesmo assunto. Menos que 3 = sem vídeo (não forçamos argumento fraco). */
function escolherAchados(achados, max = MINIMO) {
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

module.exports = { escolherAchados, frase, foco, MINIMO };
