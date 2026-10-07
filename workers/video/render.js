// Monta os textos (roteiro fixo + dados do lead) e renderiza o modelo em MP4 vertical, sem áudio.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');

// 1 = vídeo de diagnóstico (1º do funil) · 2 = vídeo de visão/transformação (2º do funil)
const MODELOS = {
  1: path.join(__dirname, 'template'),
  2: path.join(__dirname, 'template-2'),
};
const roteiro = (n) => JSON.parse(fs.readFileSync(path.join(MODELOS[n], 'roteiro.json'), 'utf8'));
const TEMPLATE = MODELOS[1];
const ROTEIRO = roteiro(1);
const FPS = 30;

const frase = (s) => { s = String(s).trim().replace(/[.\s]+$/, ''); return s[0].toUpperCase() + s.slice(1) + '.'; };
const capital = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Textos de todas as telas: roteiro padrão (80%) com os dados do lead (20%). */
function montarTextos(f) {
  const v = {
    EMPRESA: f.empresa,
    A_EMPRESA: f.empresa,
    a_empresa: f.empresa,
    segmento: f.segmento || 'serviços',
    em_cidade: f.cidade ? `em ${f.cidade}` : 'perto de mim',
  };
  const t = {};
  for (const [k, s] of Object.entries(ROTEIRO)) t[k] = s.replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '').replace(/\s{2,}/g, ' ').trim();
  // os 3 pontos: o que vimos + o impacto daquele ponto
  [['s3', f.problema1], ['s4', f.problema2], ['s4c', f.problema3]].forEach(([k, p]) => {
    if (!p) return;
    t[`${k}_b`] = frase(p.text);
    if (p.impacto) t[`${k}_c`] = p.impacto;
  });
  return t;
}

/** Ficha do vídeo a partir do lead + análise do site. */
function montarFicha(lead, analise) {
  const [p1, p2, p3] = analise.escolhidos;
  let host = '';
  try { host = new URL(analise.urlFinal || lead.website).host.replace(/^www\./, ''); } catch {}
  const segmento = (lead.segment || lead.siteInfo?.segment || '').trim().toLowerCase();
  return {
    empresa: String(lead.name || lead.company || host).trim(),
    segmento,
    cidade: (lead.city || lead.siteInfo?.city || '').trim(),
    url: host,
    especialidade: capital(segmento) || analise.titulo?.split(/[|\-–]/)[0].trim().slice(0, 50) || '',
    diferencial: analise.diferencial ? capital(analise.diferencial.trim()).slice(0, 48) : '',
    cor: analise.cor || null,
    problema1: p1,
    problema2: p2 || null,
    problema3: p3 || null,
  };
}

/** Grava dados.js (o que o template lê) dentro da pasta de trabalho. */
function escreverDados(dir, ficha) {
  const rel = (n) => path.relative(TEMPLATE, path.join(dir, n)).split(path.sep).join('/');
  const prob = (p) => p && { curto: p.short, print: rel(p.print), foco: p.foco };
  const dados = {
    empresa: ficha.empresa, cidade: ficha.cidade, url: ficha.url,
    diferencial: ficha.diferencial, especialidade: ficha.especialidade,
    logo: null, home: rel('home.png'),
    problema1: prob(ficha.problema1), problema2: prob(ficha.problema2), problema3: prob(ficha.problema3),
    textos: montarTextos(ficha),
  };
  fs.writeFileSync(path.join(dir, 'dados.js'), `window.FICHA = ${JSON.stringify(dados)};\nwindow.CONFIG = ${JSON.stringify({ assinatura: 'HZK Company', assinatura_logo: 'assets/hzk-logo.png' })};\n`);
  return path.relative(TEMPLATE, dir).split(path.sep).join('/');
}

/** Dados do vídeo 2 (visão): o roteiro fixo + o que é deste lead. */
function escreverDados2(dir, ficha) {
  const base = MODELOS[2];
  const v = { EMPRESA: ficha.empresa };
  const textos = {};
  for (const [k, s] of Object.entries(roteiro(2))) textos[k] = s.replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');
  const dados = {
    empresa: ficha.empresa, segmento: ficha.segmento, cidade: ficha.cidade, url: ficha.url,
    home: path.relative(base, path.join(dir, 'home.png')).split(path.sep).join('/'),
    problema: ficha.problema1?.short || '',
    servico: [capital(ficha.segmento), ficha.cidade && `em ${ficha.cidade}`].filter(Boolean).join(' ') || ficha.especialidade || ficha.empresa,
    diferencial: ficha.diferencial, cor: ficha.cor, textos,
  };
  fs.writeFileSync(path.join(dir, 'dados.js'), `window.FICHA = ${JSON.stringify(dados)};
window.CONFIG = ${JSON.stringify({ assinatura_logo: '../template/assets/hzk-logo.png' })};
`);
  return path.relative(base, dir).split(path.sep).join('/');
}

/** Renderiza o vídeo (modelo 1 ou 2). onProgress(0..1) para o heartbeat. Devolve { arquivo, duracao }. */
async function renderizar(browser, dir, ficha, { onProgress, stills, modelo = 1 } = {}) {
  const d = modelo === 2 ? escreverDados2(dir, ficha) : escreverDados(dir, ficha);
  const base = MODELOS[modelo];
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  await page.goto(pathToFileURL(path.join(base, 'index.html')).href + `?render=1&d=${encodeURIComponent(d)}`, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction('window.__ready === true', { timeout: 30000 }).catch(() => { throw new Error(`o modelo não carregou: ${erros.join('; ') || 'tempo esgotado'}`); });
  const duracao = await page.evaluate('window.__duration');

  if (stills) {
    for (const t of stills) {
      await page.evaluate((t) => window.__seek(t), t);
      await page.screenshot({ path: path.join(dir, `still-${String(t).padStart(5, '0')}.png`) });
    }
    await page.close();
    return { arquivo: null, duracao };
  }

  const arquivo = path.join(dir, modelo === 2 ? 'video-2.mp4' : 'video.mp4');
  const total = Math.ceil(duracao * FPS);
  const ff = spawn(process.env.FFMPEG || 'ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', arquivo], { stdio: ['pipe', 'ignore', 'inherit'] });
  const fim = new Promise((ok, err) => ff.on('close', (c) => (c ? err(new Error('ffmpeg falhou')) : ok())));
  for (let i = 0; i < total; i++) {
    await page.evaluate((t) => window.__seek(t), i / FPS);
    const buf = await page.screenshot({ type: 'jpeg', quality: 92 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (onProgress && i % 150 === 0) await onProgress(i / total);
  }
  ff.stdin.end();
  await fim;
  await page.close();
  return { arquivo, duracao };
}

module.exports = { montarTextos, montarFicha, renderizar };
