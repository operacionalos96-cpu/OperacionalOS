// Escolhe os 3 pontos do vídeo e escreve as frases. Puro (testado em selecionar.test.mjs).
// Só entram pontos que pesam na decisão de quem está conhecendo a empresa — e que foram MEDIDOS.
// As frases descrevem o que foi visto; o "impacto" explica por que importa, sem prometer nem acusar.

const MINIMO = 3;

// Pontos do mesmo assunto não aparecem juntos (o vídeo precisa de 3 argumentos diferentes).
const FAMILIA = { contato_no_fim: 'contato', sem_whatsapp: 'contato', sem_cta_topo: 'contato', titulo_generico: 'busca', titulo_so_nome: 'busca', sem_descricao: 'busca' };

function frase(a) {
  switch (a.kind) {
    case 'nao_responsivo':
      return {
        text: 'no celular, a página fica mais larga que a tela e precisa de zoom para ler',
        short: 'Não adaptado ao celular',
        impacto: 'Para quem abre pelo celular, a primeira impressão já começa com esforço.',
      };
    case 'subdominio_gratuito':
      return {
        text: `o endereço do site é um subdomínio gratuito (${a.host})`,
        short: 'Sem domínio próprio',
        impacto: 'Um endereço próprio é um dos primeiros sinais de empresa estabelecida.',
      };
    case 'topo_sem_proposta':
      return {
        text: a.soNome || (a.titulo && !/^(seja )?bem[- ]vind/i.test(a.titulo) && a.titulo.split(' ').length <= 5)
          ? `a primeira tela mostra só "${a.titulo}", sem dizer o que vocês fazem`
          : a.titulo && /^(seja )?bem[- ]vind/i.test(a.titulo)
          ? `a primeira tela abre com "${a.titulo}", sem dizer o que vocês fazem`
          : 'a primeira tela não diz com clareza o que vocês fazem',
        short: 'Topo sem proposta clara',
        impacto: 'Quem chega precisa rolar ou adivinhar para entender o que a empresa oferece.',
      };
    case 'servicos_sem_explicacao': {
      const nome = a.nome || 'serviços';
      return {
        text: `os ${nome} aparecem só como uma lista de nomes, sem explicar o que cada um resolve`,
        short: `${nome[0].toUpperCase()}${nome.slice(1)} sem explicação`,
        impacto: 'Quem pesquisa não descobre o que cada um resolve para ele.',
      };
    }
    case 'contato_no_fim':
      return {
        text: 'o contato só aparece depois de rolar boa parte da página',
        short: 'Contato escondido',
        impacto: 'O próximo passo fica longe justamente quando o interesse é maior.',
      };
    case 'sem_cta_topo':
      return {
        text: 'na primeira tela não há um botão para chamar a empresa',
        short: 'Sem chamada na primeira tela',
        impacto: 'Quem já está convencido precisa procurar como falar com vocês.',
      };
    case 'sem_whatsapp':
      return {
        text: 'não há um botão de WhatsApp para chamar a empresa direto pelo site',
        short: 'Sem botão de WhatsApp',
        impacto: 'O caminho até a conversa fica mais longo do que precisa.',
      };
    case 'sem_localizacao':
      return {
        text: 'o site não diz em que cidade ou região vocês atendem',
        short: 'Sem localização clara',
        impacto: 'Para clientes, buscadores e IAs, fica mais difícil ligar vocês à região.',
      };
    case 'pouco_conteudo':
      return {
        text: `a página inteira tem cerca de ${Math.round(a.palavras / 10) * 10} palavras para apresentar a empresa`,
        short: 'Pouco conteúdo sobre a empresa',
        impacto: 'Há pouco contexto para entender os serviços, a experiência e os diferenciais.',
      };
    case 'titulo_generico':
      return {
        text: `o título que aparece na busca do Google é só "${a.titulo}"`,
        short: 'Título genérico no Google',
        impacto: 'É o primeiro texto que alguém lê ao pesquisar vocês.',
      };
    case 'titulo_so_nome':
      return {
        text: `o título que aparece no Google é só o nome da empresa ("${a.titulo}")`,
        short: 'Google não sabe o que vocês fazem',
        impacto: 'Quem pesquisa pelo serviço não encontra uma pista do que vocês oferecem.',
      };
    case 'sem_descricao':
      return {
        text: 'o site não tem a descrição que o Google mostra na busca',
        short: 'Sem descrição para o Google',
        impacto: 'O resumo que aparece na pesquisa fica por conta do Google, e não da empresa.',
      };
    case 'sem_autoridade':
      return {
        text: 'o site não mostra a experiência, a formação ou a trajetória por trás da empresa',
        short: 'Experiência não aparece',
        impacto: 'É justamente o que dá segurança para quem ainda não conhece vocês.',
      };
    case 'sem_prova_social':
      return {
        text: 'o site não mostra depoimentos ou avaliações de clientes',
        short: 'Sem depoimentos de clientes',
        impacto: 'Quem não conhece vocês não encontra a confirmação de outros clientes.',
      };
    case 'lento':
      return {
        text: `no nosso teste, o site levou ${a.segundos} segundos para carregar`,
        short: 'Carregamento lento',
        impacto: 'A espera acontece justamente no primeiro contato com a empresa.',
      };
    case 'sem_https':
      return {
        text: 'o site ainda abre sem o cadeado de segurança (https)',
        short: 'Site sem https',
        impacto: 'O navegador marca a página como "não segura" para o visitante.',
      };
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
