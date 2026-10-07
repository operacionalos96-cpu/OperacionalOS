// Worker "Video Studio": pega jobs render_prospect_video da fila do Operacional OS,
// gera o vídeo do lead (site real → achados → render) e devolve o resultado.
//   node worker.js            → fica rodando (polling decidido pelo servidor)
//   node worker.js --uma-vez  → processa no máximo 1 job e sai
// Configuração no arquivo .env (veja .env.example).
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { analisarSite } = require('./analisar');
const { montarFicha, renderizar } = require('./render');
const { MINIMO, foco } = require('./selecionar');

for (const linha of (fs.existsSync(path.join(__dirname, '.env')) ? fs.readFileSync(path.join(__dirname, '.env'), 'utf8') : '').split(/\r?\n/)) {
  const m = /^\s*([A-Z_]+)\s*=\s*(.*)\s*$/.exec(linha);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const BASE = (process.env.OOS_URL || 'https://operacional-os.vercel.app').replace(/\/$/, '');
const TOKEN = process.env.OOS_WORKER_TOKEN;
const UMA_VEZ = process.argv.includes('--uma-vez');
const BROWSERS = [
  process.env.BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
].filter(Boolean);

if (!TOKEN) {
  console.error('Falta OOS_WORKER_TOKEN no .env (AI Office → Workers → Novo worker, agente Video Studio, capability video_render).');
  process.exit(1);
}

async function tool(nome, args = {}) {
  const res = await fetch(`${BASE}/api/workers/${nome}`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify(args) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(`${nome}: ${data.erro || res.status}${data.details ? ' ' + JSON.stringify(data.details) : ''}`), { status: res.status });
  return data;
}

const dormir = (s) => new Promise((r) => setTimeout(r, s * 1000));

async function executar(browser, job, lease) {
  const ids = { job_id: job.public_id, lease_id: lease.lease_id };
  const ctx = await tool('get_job_context', { job_id: job.public_id });
  const lead = ctx.entity || {};
  if (!/^https?:\/\//i.test(lead.website || '')) return tool('fail_job', { ...ids, error: 'lead sem site', retryable: false });

  await tool('start_job', { ...ids, engine: 'video-worker' });
  // heartbeat: renova o lease a cada ~1/3 do prazo enquanto trabalha
  const renovar = setInterval(() => tool('renew_lease', ids).catch((e) => console.warn('  renovar lease:', e.message)), Math.max(30, lease.renew_every_seconds || 200) * 1000);
  const dir = path.join(__dirname, '.trabalho', job.public_id);
  fs.mkdirSync(dir, { recursive: true });
  try {
    console.log(`▸ ${lead.name} — ${lead.website}`);
    await tool('report_progress', { ...ids, message: 'abrindo o site e tirando os prints', percent: 5 });
    // Os 3 pontos vêm da análise do Claude (job anterior); sem ela, usa os detectores automáticos.
    const pontos = job.payload?.analysis?.points || null;
    const extra = job.payload?.analysis || {};
    const analise = await analisarSite(browser, lead.website, dir, {
      nome: lead.name,
      segmento: extra.segmento || lead.segment || lead.siteInfo?.segment,
      cidade: extra.cidade || lead.city || lead.siteInfo?.city,
      ancoras: pontos ? pontos.map((p) => p.anchor || '') : [],
    });
    if (pontos) {
      analise.escolhidos = pontos.map((p, i) => {
        const area = analise.ancoras[i];
        return { kind: p.kind || 'analise', text: p.text, short: p.short, impacto: p.impacto, print: area ? 'pagina.png' : 'home.png', foco: foco(area), evidencia: p.anchor || '' };
      });
      if (extra.diferencial) analise.diferencial = extra.diferencial;
    }
    fs.writeFileSync(path.join(dir, 'analise.json'), JSON.stringify(analise, null, 2));
    if (analise.escolhidos.length < MINIMO) {
      const vistos = analise.escolhidos.map((a) => a.short).join(', ') || 'nenhum';
      return await tool('fail_job', { ...ids, error: `o site não tem ${MINIMO} pontos fortes comprováveis (achados: ${vistos}) — sem vídeo, não forçamos argumento fraco`, retryable: false });
    }
    console.log('  achados:', analise.escolhidos.map((a) => a.short).join(' | '));

    const ficha = montarFicha({ ...lead, segment: extra.segmento || lead.segment, city: extra.cidade || lead.city }, analise);
    if (extra.especialidade) ficha.especialidade = extra.especialidade;
    await tool('report_progress', { ...ids, message: `achados: ${analise.escolhidos.map((a) => a.short).join(', ')} — renderizando`, percent: 20 });
    let ultimo = 0;
    const progresso = (de, ate, msg) => async (p) => {
      const pct = Math.round(de + p * (ate - de));
      if (pct - ultimo >= 10) { ultimo = pct; await tool('report_progress', { ...ids, message: msg, percent: pct }).catch(() => {}); }
    };
    // 1º vídeo (diagnóstico) e 2º vídeo (visão/transformação), com a mesma análise do site real
    const v1 = await renderizar(browser, dir, ficha, { modelo: 1, onProgress: progresso(20, 55, 'renderizando o vídeo 1 (diagnóstico)') });
    let v2 = null;
    try {
      v2 = await renderizar(browser, dir, ficha, { modelo: 2, onProgress: progresso(55, 90, 'renderizando o vídeo 2 (visão)') });
    } catch (e) {
      console.warn('  vídeo 2 falhou (segue só com o 1):', e.message);
    }

    const up = await tool('create_upload_urls', ids);
    const subir = async (url, arquivo) => {
      const res = await fetch(url, { method: 'PUT', headers: { 'content-type': 'video/mp4', 'x-upsert': 'true' }, body: fs.readFileSync(arquivo) });
      if (!res.ok) throw new Error(`upload falhou: ${res.status} ${await res.text().catch(() => '')}`);
    };
    await subir(up.signed_url, v1.arquivo);
    if (v2) await subir(up.video2.signed_url, v2.arquivo);

    await tool('complete_job', {
      ...ids,
      result: {
        video_path: up.path,
        ...(v2 ? { video2_path: up.video2.path } : {}),
        duration_sec: Math.round(v1.duracao),
        findings: analise.escolhidos.map(({ kind, text, short }) => ({ kind, text, short })),
      },
    });
    const duracao = v1.duracao;
    console.log(`  ✓ pronto (${Math.round(duracao)} s${v2 ? ` + vídeo 2 de ${Math.round(v2.duracao)} s` : ''}) — aguardando aprovação no sistema`);
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (e) {
    console.error('  ✗', e.message);
    await tool('fail_job', { ...ids, error: e.message.slice(0, 500), retryable: e.retryable !== false }).catch(() => {});
  } finally {
    clearInterval(renovar);
  }
}

(async () => {
  const exe = BROWSERS.find((b) => fs.existsSync(b));
  if (!exe) throw new Error('não achei Edge/Chrome — defina BROWSER no .env');
  const cfg = await tool('get_worker_config');
  console.log(`Video Studio conectado como ${cfg.worker?.name || cfg.worker?.id} em ${BASE}`);
  const browser = await puppeteer.launch({ executablePath: exe, headless: 'new', args: ['--allow-file-access-from-files', '--hide-scrollbars'] });
  try {
    for (;;) {
      let r;
      try {
        r = await tool('claim_next_job', { wait_seconds: 25 });
      } catch (e) {
        console.warn('fila indisponível:', e.message);
        await dormir(30);
        continue;
      }
      if (r.job) await executar(browser, r.job, r.lease);
      if (UMA_VEZ) break;
      if (!r.job) await dormir(Math.min(300, r.poll?.retry_after_seconds ?? 30));
    }
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
