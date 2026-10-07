// Testa o vídeo de UM site sem passar pela fila (nada é enviado ao sistema).
//   node testar.js https://site-da-empresa.com.br --nome "Empresa X" --segmento odontologia --cidade Campinas
//   node testar.js <url> ... --stills 3,15,30   → só imagens de conferência
//   node testar.js <url> ... --video 2          → o 2º vídeo do funil (visão/transformação)
// Sai em .trabalho/teste-<data>/ (prints, analise.json e video.mp4).
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const puppeteer = require('puppeteer-core');
const { analisarSite } = require('./analisar');
const { montarFicha, renderizar } = require('./render');

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf('--' + k); return i > -1 ? args[i + 1] : undefined; };
let url = args.find((a) => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--'));
if (!url) {
  console.log('uso: node testar.js <url> --nome "Empresa" --segmento odontologia --cidade Campinas [--stills 3,15,30]');
  process.exit(1);
}
if (!/^https?:|^file:/.test(url)) url = pathToFileURL(path.resolve(url)).href;
const EXE = [process.env.BROWSER, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].filter(Boolean).find((b) => fs.existsSync(b));

(async () => {
  const dir = path.join(__dirname, '.trabalho', `teste-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`);
  fs.mkdirSync(dir, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: EXE, headless: 'new', args: ['--allow-file-access-from-files', '--hide-scrollbars'] });
  try {
    const analise = await analisarSite(browser, url, dir, { nome: opt('nome'), segmento: opt('segmento'), cidade: opt('cidade') });
    fs.writeFileSync(path.join(dir, 'analise.json'), JSON.stringify(analise, null, 2));
    console.log('medido:', analise.achados.map((a) => `${a.kind}(${a.prioridade})`).join(', ') || 'nada');
    console.log('no vídeo:', analise.escolhidos.map((a) => `${a.short} — ${a.evidencia}`).join(' | ') || 'nada (sem vídeo)');
    if (!analise.escolhidos.length) return;
    const lead = { name: opt('nome') || new URL(url).host, website: url, segment: opt('segmento'), city: opt('cidade') };
    const stills = opt('stills')?.split(',').map(Number);
    const modelo = Number(opt('video') || 1);
    const { arquivo, duracao } = await renderizar(browser, dir, montarFicha(lead, analise), { stills, modelo, onProgress: (p) => process.stdout.write(`\r  renderizando ${Math.round(p * 100)}%`) });
    console.log(`\n${arquivo ? `vídeo: ${arquivo}` : `stills em ${dir}`} (${duracao.toFixed(1)} s)`);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
