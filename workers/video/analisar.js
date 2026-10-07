// Abre o site REAL do lead, tira os prints e mede problemas que dá para PROVAR na página.
// Cada achado vem com a área exata (x, y, largura, altura em pixels do print da página inteira),
// para o vídeo dar zoom e destacar o ponto. Nada é inventado: sem evidência, sem achado.
const path = require('path');
const { escolherAchados } = require('./selecionar');

const VIEW = { width: 1440, height: 900 };
const MAX_ALTURA = 12000;

// Esconde avisos de cookies/LGPD (sem clicar em "aceitar") para não cobrir o print.
async function limparSobreposicoes(page) {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
      const txt = (el.innerText || '').toLowerCase().slice(0, 600);
      const id = `${el.id} ${el.className}`.toLowerCase();
      if (/cookie|lgpd|privacidade|consent|gdpr/.test(txt + ' ' + id) && el.getBoundingClientRect().height < window.innerHeight * 0.9) el.style.setProperty('display', 'none', 'important');
    }
  });
}

// Rola a página toda para carregar imagens/seções preguiçosas e volta ao topo.
async function carregarTudo(page) {
  await page.evaluate(async (max) => {
    const passo = 700;
    for (let y = 0; y < Math.min(document.documentElement.scrollHeight, max); y += passo) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  }, MAX_ALTURA);
  await new Promise((r) => setTimeout(r, 800));
}

// Roda DENTRO da página: mede tudo e devolve candidatos com evidência e área.
function medir(ctx, maxAltura) {
  const W = document.documentElement.clientWidth;
  const doc = (r) => ({ x: Math.max(0, Math.round(r.left + scrollX)), y: Math.max(0, Math.round(r.top + scrollY)), w: Math.round(r.width), h: Math.round(r.height) });
  const visivel = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 2 && r.height > 2 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05;
  };
  const fixo = (el) => {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const p = getComputedStyle(e).position;
      if (p === 'fixed' || p === 'sticky') return true;
    }
    return false;
  };
  // Sobe até um bloco de tamanho razoável (seção) para o destaque fazer sentido no vídeo.
  const bloco = (el, minH = 140, maxH = 700) => {
    let best = el;
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const r = e.getBoundingClientRect();
      if (r.height > maxH) break;
      best = e;
      if (r.height >= minH && r.width >= W * 0.5) break;
    }
    return best;
  };
  const texto = (document.body.innerText || '').replace(/\s+/g, ' ');
  const achados = [];
  const altura = Math.min(document.documentElement.scrollHeight, maxAltura);
  const dentro = (a) => a.y + a.h <= altura;

  // 2) / 3) Contato: WhatsApp/telefone só lá embaixo, ou nenhum botão de WhatsApp
  {
    const links = [...document.querySelectorAll('a[href]')].filter(visivel);
    const ehWhats = (a) => /wa\.me|whatsapp/i.test(a.href + ' ' + (a.getAttribute('aria-label') || '') + ' ' + a.className + ' ' + (a.querySelector('img')?.src || '') + ' ' + (a.querySelector('img')?.alt || ''));
    const contatos = links.filter((a) => ehWhats(a) || /^tel:/i.test(a.getAttribute('href') || ''));
    const flutuante = contatos.some(fixo);
    const telTexto = [...document.querySelectorAll('body *')].filter((e) => e.children.length === 0 && visivel(e) && /\(?\b\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/.test(e.textContent || ''));
    const todos = [...contatos.filter((a) => !fixo(a)), ...telTexto.filter((e) => !fixo(e))];
    const primeiro = todos.map((e) => ({ e, top: e.getBoundingClientRect().top + scrollY })).sort((a, b) => a.top - b.top)[0];
    if (!flutuante && primeiro && primeiro.top > innerHeight * 2.2) {
      const area = doc(bloco(primeiro.e, 100, 420).getBoundingClientRect());
      if (dentro(area)) achados.push({ kind: 'contato_no_fim', prioridade: 85, area, topo: Math.round(primeiro.top), evidencia: (primeiro.e.textContent || primeiro.e.href || '').trim().slice(0, 80) });
    }
    // Chamada para contato visível na 1ª tela (botão/link de WhatsApp, telefone, agendar, orçamento, contato)
    const cta = [...document.querySelectorAll('a, button')].filter((e) => {
      const r = e.getBoundingClientRect();
      const t = ((e.innerText || '') + ' ' + (e.getAttribute('href') || '') + ' ' + (e.getAttribute('aria-label') || '')).toLowerCase();
      if (!(visivel(e) && r.top >= 0 && r.top < innerHeight)) return false;
      if (/whats|wa\.me|tel:/.test(t)) return true;
      // botão de verdade (com fundo ou borda), fora do menu — o link "Contato" do menu não conta
      const cs = getComputedStyle(e);
      const botao = e.tagName === 'BUTTON' || !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor) || parseFloat(cs.borderTopWidth) > 0;
      return botao && !e.closest('nav, [role="navigation"]') && /agend|or[cç]amento|fale|contato|ligue|marcar|consulta|reserv|solicit|chamar/.test(t);
    });
    if (!cta.length && !flutuante) {
      achados.push({ kind: 'sem_cta_topo', prioridade: 80, area: { x: 0, y: 0, w: W, h: Math.min(innerHeight, 900) }, evidencia: 'nenhum botão/link de contato visível na primeira tela' });
    }
    if (!links.some(ehWhats)) {
      const header = document.querySelector('header') || document.querySelector('nav');
      const r = header && visivel(header) ? header.getBoundingClientRect() : null;
      const area = r && r.height > 40 && r.height < 500 ? doc(r) : { x: 0, y: 0, w: W, h: Math.min(innerHeight, 520) };
      achados.push({ kind: 'sem_whatsapp', prioridade: 70, area, evidencia: `${links.length} links, nenhum de WhatsApp` });
    }
  }

  // 4) Serviços só como lista de nomes (sem explicar o que cada um resolve)
  {
    const titulos = [...document.querySelectorAll('h1,h2,h3,h4')].filter((h) => visivel(h) && /servi[cç]|tratament|especialidad|[aá]reas? de atua|solu[cç][oõ]|o que fazemos|procedimento/i.test(h.textContent || ''));
    for (const h of titulos) {
      let sec = h.parentElement;
      for (let i = 0; i < 4 && sec && sec.getBoundingClientRect().height < 160; i++) sec = sec.parentElement;
      if (!sec) continue;
      const itens = [...sec.querySelectorAll('li, h3, h4, h5')].filter((e) => e !== h && visivel(e) && (e.textContent || '').trim().length > 1);
      if (itens.length < 3) continue;
      const mediaItem = itens.reduce((s, e) => s + (e.textContent || '').trim().length, 0) / itens.length;
      const palavras = (sec.innerText || '').trim().split(/\s+/).length;
      const palavrasPorItem = palavras / itens.length;
      if (mediaItem <= 30 && palavrasPorItem <= 7) {
        const area = doc(sec.getBoundingClientRect());
        const nome = /tratament/i.test(h.textContent) ? 'tratamentos' : /procedimento/i.test(h.textContent) ? 'procedimentos' : /especialidad/i.test(h.textContent) ? 'especialidades' : 'serviços';
        if (dentro(area) && area.h < 1400) {
          achados.push({ kind: 'servicos_sem_explicacao', prioridade: 80, nome, itens: itens.length, area, evidencia: itens.slice(0, 6).map((e) => e.textContent.trim()).join(', ').slice(0, 120) });
          break;
        }
      }
    }
  }

  // 5) Topo sem dizer o que a empresa faz: o maior texto da 1ª tela é "Bem-vindo" ou só o nome
  {
    const cands = [...document.querySelectorAll('h1,h2,h3,p,span,div,a')].filter((e) => {
      const r = e.getBoundingClientRect();
      const t = (e.innerText || '').trim();
      return visivel(e) && r.top >= 0 && r.top < innerHeight && t.length >= 3 && t.length < 160 && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 2);
    });
    const maior = cands.sort((a, b) => parseFloat(getComputedStyle(b).fontSize) - parseFloat(getComputedStyle(a).fontSize))[0];
    if (maior) {
      const t = maior.innerText.trim().replace(/\s+/g, ' ');
      const nPal = t.split(' ').length;
      // só o nome da empresa? (as palavras do maior texto estão todas no nome do lead)
      const nz = (x) => (x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
      const nomeW = nz(ctx.nome);
      const soNome = nomeW.length > 0 && nPal <= 5 && nz(t).length > 0 && nz(t).every((w) => nomeW.some((n) => n.startsWith(w) || w.startsWith(n)));
      if (/^(seja )?bem[- ]vind[oa]s?/i.test(t) || nPal <= 2 || soNome) {
        achados.push({ kind: 'topo_sem_proposta', prioridade: 84, titulo: t.slice(0, 60), area: { x: 0, y: 0, w: W, h: Math.min(innerHeight, Math.max(400, Math.round(maior.getBoundingClientRect().bottom + scrollY + 80))) }, evidencia: t.slice(0, 80) });
      }
    }
  }

  // 6) Sem depoimentos/avaliações de clientes
  if (!/depoimento|avalia[cç][aãõ]|o que (nossos |os )?(clientes|pacientes)|(clientes|pacientes) (dizem|falam)|google reviews?|★★★/i.test(texto)) {
    achados.push({ kind: 'sem_prova_social', prioridade: 50, area: null, evidencia: 'nenhuma menção a depoimentos/avaliações no texto da página' });
  }

  // 7) Topo não diz o que a empresa faz (o segmento não aparece na 1ª tela)
  const norm = (x) => (x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const primeiraTela = norm([...document.querySelectorAll('h1,h2,h3,p,span,a,li,div')].filter((e) => { const r = e.getBoundingClientRect(); return visivel(e) && r.top >= 0 && r.top < innerHeight && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()); }).map((e) => e.innerText).join(' '));
  const raizes = norm(ctx.segmento).split(/[^a-z]+/).filter((w) => w.length >= 5).map((w) => w.slice(0, Math.max(5, w.length - 3)));
  if (raizes.length && !raizes.some((r) => primeiraTela.includes(r)) && !achados.some((a) => a.kind === 'topo_sem_proposta')) {
    achados.push({ kind: 'topo_sem_proposta', prioridade: 88, titulo: '', area: { x: 0, y: 0, w: W, h: Math.min(innerHeight, 900) }, evidencia: `"${ctx.segmento}" não aparece na primeira tela` });
  }

  // 8) Sem localização clara (cidade, endereço ou CEP em lugar nenhum da página)
  const temCidade = ctx.cidade && norm(texto).includes(norm(ctx.cidade));
  const temEndereco = /\b\d{5}-?\d{3}\b|\b(rua|av\.|avenida|alameda|rodovia|estrada)\s+[A-ZÀ-Ý]/i.test(texto);
  if (!temCidade && !temEndereco) achados.push({ kind: 'sem_localizacao', prioridade: 76, area: null, evidencia: 'sem cidade, endereço ou CEP no texto da página' });

  // 9) Pouco conteúdo para apresentar a empresa
  const palavras = texto.split(' ').filter((w) => /[a-zà-ÿ]{3,}/i.test(w)).length;
  if (palavras < 350) achados.push({ kind: 'pouco_conteudo', prioridade: 74, palavras, area: null, evidencia: `${palavras} palavras na página` });

  // 10) Título genérico (é o que aparece na busca do Google)
  const titulo = (document.title || '').trim();
  if (!titulo || /^(home|in[ií]cio|p[aá]gina inicial|index|untitled|sem t[ií]tulo|meu site|site|bem[- ]vindo)\b/i.test(titulo)) {
    achados.push({ kind: 'titulo_generico', prioridade: 70, titulo: titulo || '(sem título)', area: null, evidencia: `title: "${titulo}"` });
  }
  // 10b) Título do Google só com o nome da empresa (não diz o que fazem)
  {
    const nz = (x) => norm(x).split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
    const tw = nz(titulo), nw = nz(ctx.nome);
    if (titulo && tw.length && nw.length && tw.every((w) => nw.some((n) => n.startsWith(w) || w.startsWith(n))) && !achados.some((a) => a.kind === 'titulo_generico')) {
      achados.push({ kind: 'titulo_so_nome', prioridade: 72, titulo, area: null, evidencia: `title: "${titulo}"` });
    }
  }
  // 10c) Sem descrição para a busca (o resumo que aparece no Google)
  const desc = (document.querySelector('meta[name="description"]')?.getAttribute('content') || '').trim();
  if (desc.length < 50) achados.push({ kind: 'sem_descricao', prioridade: 69, area: null, evidencia: desc ? `description curta: "${desc}"` : 'sem meta description' });

  // 11) Experiência/autoridade não aparece (anos, formação, registro, equipe, quem somos)
  if (!/anos de|h[aá] mais de \d|desde (19|20)\d{2}|experi[eê]ncia|forma[cç][aã]o|especializa|p[oó]s[- ]gradua|mestr[ae]|doutor|\b(crp|crm|cro|oab|crc|crea|cau|coren|crefito|crn)\b|certifica|nossa equipe|quem somos|sobre (n[oó]s|mim|a empresa)|nossa hist[oó]ria|trajet[oó]ria/i.test(texto)) {
    achados.push({ kind: 'sem_autoridade', prioridade: 78, area: null, evidencia: 'sem anos de mercado, formação, registro, equipe ou "quem somos" no texto' });
  }

  // Trechos indicados pela análise (Claude): acha o bloco onde cada um aparece
  const ancoras = (ctx.ancoras || []).map((t) => {
    const alvo = norm(t).replace(/\s+/g, ' ').trim();
    if (alvo.length < 3) return null;
    const els = [...document.querySelectorAll('body *')].filter((e) => visivel(e) && norm(e.innerText).replace(/\s+/g, ' ').includes(alvo));
    const menor = els.sort((a, b) => (a.innerText || '').length - (b.innerText || '').length)[0];
    if (!menor) return null;
    const area = doc(bloco(menor, 120, 640).getBoundingClientRect());
    return dentro(area) ? area : null;
  });

  // Dados para personalizar (tirados do site, nunca inventados)
  const dif =
    /\b(h[áa] mais de \d{1,3} anos|mais de \d{1,3} anos de (?:experi[eê]ncia|mercado|atua[cç][aã]o|hist[oó]ria)|desde (?:19|20)\d{2}|\d{1,3} anos de (?:experi[eê]ncia|mercado|tradi[cç][aã]o)|atendimento 24 ?h(?:oras)?|hora marcada[^.;,]{0,30})/i.exec(texto)?.[1] || null;
  // Cor principal da marca: a cor saturada que mais ocupa área em botões, cabeçalho e links de destaque.
  const cor = (() => {
    const peso = new Map();
    const rgb = (s) => (/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(s) || []).slice(1).map(Number);
    const els = [...document.querySelectorAll('header, nav, header *, button, a, [class*="btn"], [class*="button"], h1, h2')].filter(visivel).slice(0, 600);
    for (const e of els) {
      const cs = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      for (const [prop, w] of [['backgroundColor', r.width * r.height], ['color', Math.min(4000, r.width * 20)]]) {
        const [R, G, B, A = 1] = rgb(cs[prop]);
        if (R === undefined || A < 0.6) continue;
        const max = Math.max(R, G, B) / 255, min = Math.min(R, G, B) / 255, l = (max + min) / 2;
        const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
        if (s < 0.35 || l < 0.18 || l > 0.75) continue;
        const k = '#' + [R, G, B].map((x) => (Math.round(x / 8) * 8).toString(16).padStart(2, '0').slice(-2)).join('');
        peso.set(k, (peso.get(k) || 0) + w);
      }
    }
    return [...peso.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  })();

  const descricao = (document.querySelector('meta[name="description"]')?.getAttribute('content') || '').trim();
  return { achados, ancoras, altura, titulo: document.title, descricao, texto: texto.slice(0, 7000), diferencial: dif, cor, https: location.protocol === 'https:' };
}

/** Analisa o site e salva home.png, pagina.png e mobile.png em `dir`. ctx = { segmento, cidade } do lead. */
async function analisarSite(browser, url, dir, ctx = {}) {
  const page = await browser.newPage();
  await page.setViewport({ ...VIEW, deviceScaleFactor: 1 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36');
  const t0 = Date.now();
  const resp = await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  const carregou = (Date.now() - t0) / 1000;
  await page.waitForNetworkIdle({ idleTime: 800, timeout: 20000 }).catch(() => {});
  if (!resp || resp.status() >= 400) throw Object.assign(new Error(`site respondeu ${resp ? resp.status() : 'sem resposta'}`), { retryable: true });
  await new Promise((r) => setTimeout(r, 1500));
  await limparSobreposicoes(page);
  await carregarTudo(page);
  await limparSobreposicoes(page);
  const medida = await page.evaluate(medir, { segmento: ctx.segmento || '', cidade: ctx.cidade || '', nome: ctx.nome || '', ancoras: ctx.ancoras || [] }, MAX_ALTURA);
  await page.screenshot({ path: path.join(dir, 'home.png') });
  await page.screenshot({ path: path.join(dir, 'pagina.png'), clip: { x: 0, y: 0, width: VIEW.width, height: medida.altura }, captureBeyondViewport: true });
  const urlFinal = page.url();
  await page.close();

  // Celular: a página cabe na tela de um celular?
  const mob = await browser.newPage();
  await mob.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await mob.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
  await mob.goto(urlFinal, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => null);
  await new Promise((r) => setTimeout(r, 1200));
  await limparSobreposicoes(mob);
  const larguraMobile = await mob.evaluate(() => document.documentElement.scrollWidth);
  await mob.screenshot({ path: path.join(dir, 'mobile.png') });
  await mob.close();
  if (larguraMobile > 420) medida.achados.push({ kind: 'nao_responsivo', prioridade: 88, area: null, larguraMobile, evidencia: `no celular (390 px) a página tem ${larguraMobile} px de largura` });
  if (!medida.https) medida.achados.push({ kind: 'sem_https', prioridade: 60, area: { x: 0, y: 0, w: VIEW.width, h: 300 }, evidencia: 'abre em http://' });
  // endereço em subdomínio gratuito (sem domínio próprio)
  let host = '';
  try { host = new URL(urlFinal).host.replace(/^www\./, ''); } catch {}
  if (/\.(wixsite\.com|wordpress\.com|blogspot\.com|webnode\.(page|com|com\.br)|negocio\.site|business\.site|weebly\.com|squarespace\.com|vercel\.app|netlify\.app|github\.io|godaddysites\.com|site123\.me|jimdosite\.com|carrd\.co|lojaintegrada\.com\.br)$/i.test(host) || /^sites\.google\.com$/i.test(host)) {
    medida.achados.push({ kind: 'subdominio_gratuito', prioridade: 92, host, area: null, evidencia: host });
  }
  if (carregou > 6) medida.achados.push({ kind: 'lento', prioridade: 66, segundos: Math.round(carregou), area: null, evidencia: `carregou em ${carregou.toFixed(1)} s no teste` });

  return { ...medida, urlFinal, escolhidos: escolherAchados(medida.achados) };
}

module.exports = { analisarSite, medir };
