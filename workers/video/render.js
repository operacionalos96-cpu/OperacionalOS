// Monta os textos (roteiro fixo + dados do lead) e renderiza o modelo em MP4 vertical, sem áudio.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');

const TEMPLATE = path.join(__dirname, 'template');
const ROTEIRO = JSON.parse(fs.readFileSync(path.join(TEMPLATE, 'roteiro.json'), 'utf8'));
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
  t.s3_b = frase(f.problema1.text);
  if (f.problema2) t.s4_b = frase(f.problema2.text);
  return t;
}

/** Ficha do vídeo a partir do lead + análise do site. */
function montarFicha(lead, analise) {
  const [p1, p2] = analise.escolhidos;
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
    problema1: p1,
    problema2: p2 || null,
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
    problema1: prob(ficha.problema1), problema2: prob(ficha.problema2),
    textos: montarTextos(ficha),
  };
  fs.writeFileSync(path.join(dir, 'dados.js'), `window.FICHA = ${JSON.stringify(dados)};\nwindow.CONFIG = ${JSON.stringify({ assinatura: 'HZK Company', assinatura_logo: 'assets/hzk-logo.png' })};\n`);
  return path.relative(TEMPLATE, dir).split(path.sep).join('/');
}

/** Renderiza o vídeo. onProgress(0..1) para o heartbeat. Devolve { arquivo, duracao }. */
async function renderizar(browser, dir, ficha, { onProgress, stills } = {}) {
  const d = escreverDados(dir, ficha);
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  await page.goto(pathToFileURL(path.join(TEMPLATE, 'index.html')).href + `?render=1&d=${encodeURIComponent(d)}`, { waitUntil: 'networkidle0', timeout: 60000 });
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

  const arquivo = path.join(dir, 'video.mp4');
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
