// Ferramenta do ANALISTA (Claude da assinatura) para a fila de análises de vídeo.
//   node analista.js status                          → quantas análises esperando
//   node analista.js proximo                         → pega 1, tira os prints e mostra tudo (JSON)
//   node analista.js concluir <job> <lease> <arquivo.json>  → envia os 3 pontos
//   node analista.js falhar <job> <lease> "<motivo>"       → sem 3 pontos fortes (não força)
// Critérios: ANALISTA.md. Token: OOS_ANALISTA_TOKEN no .env.
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { analisarSite } = require('./analisar');

for (const linha of (fs.existsSync(path.join(__dirname, '.env')) ? fs.readFileSync(path.join(__dirname, '.env'), 'utf8') : '').split(/\r?\n/)) {
  const m = /^\s*([A-Z_]+)\s*=\s*(.*)\s*$/.exec(linha);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const BASE = (process.env.OOS_URL || 'https://operacional-os.vercel.app').replace(/\/$/, '');
const TOKEN = process.env.OOS_ANALISTA_TOKEN;
const EXE = [process.env.BROWSER, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].filter(Boolean).find((b) => fs.existsSync(b));

async function tool(nome, args = {}) {
  const res = await fetch(`${BASE}/api/workers/${nome}`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify(args) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${nome}: ${data.erro || res.status}${data.details ? ' ' + JSON.stringify(data.details) : ''}`);
  return data;
}
const out = (o) => console.log(JSON.stringify(o, null, 2));

(async () => {
  if (!TOKEN) throw new Error('Falta OOS_ANALISTA_TOKEN no .env');
  const [cmd, ...a] = process.argv.slice(2);

  if (cmd === 'status') {
    const s = await tool('get_queue_status');
    return out({ esperando: s.compatible_ready });
  }

  if (cmd === 'proximo') {
    const r = await tool('claim_next_job', { wait_seconds: 0 });
    if (!r.job) return out({ job: null, mensagem: 'nenhuma análise esperando' });
    const ids = { job_id: r.job.public_id, lease_id: r.lease.lease_id };
    const ctx = await tool('get_job_context', { job_id: ids.job_id });
    await tool('start_job', { ...ids, engine: 'claude-assinatura' });
    const lead = ctx.entity || {};
    const dir = path.join(__dirname, '.trabalho', `analise-${ids.job_id}`);
    fs.mkdirSync(dir, { recursive: true });
    const browser = await puppeteer.launch({ executablePath: EXE, headless: 'new', args: ['--hide-scrollbars'] });
    let m;
    try {
      m = await analisarSite(browser, lead.website, dir, { nome: lead.name, segmento: lead.segment || lead.siteInfo?.segment, cidade: lead.city || lead.siteInfo?.city });
    } catch (e) {
      await browser.close();
      await tool('fail_job', { ...ids, error: `não abriu o site: ${e.message}`.slice(0, 400), retryable: true });
      return out({ job: ids.job_id, erro: `não abriu o site: ${e.message}` });
    }
    await browser.close();
    return out({
      ...ids,
      empresa: lead.name,
      site: lead.website,
      segmento: lead.segment || lead.siteInfo?.segment || null,
      cidade: lead.city || lead.siteInfo?.city || null,
      prints: { desktop_primeira_tela: path.join(dir, 'home.png'), celular: path.join(dir, 'mobile.png'), pagina_inteira: path.join(dir, 'pagina.png') },
      titulo_no_google: m.titulo,
      descricao_no_google: m.descricao || null,
      fatos_medidos: m.achados.map((x) => `${x.kind}: ${x.evidencia}`),
      diferencial_achado_no_texto: m.diferencial,
      texto_da_pagina: m.texto,
      resultado: 'Escreva o JSON no formato de ANALISTA.md e rode: node analista.js concluir ' + ids.job_id + ' ' + ids.lease_id + ' <arquivo.json>',
    });
  }

  if (cmd === 'concluir') {
    const [job_id, lease_id, arquivo] = a;
    const result = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    await tool('complete_job', { job_id, lease_id, result });
    return out({ ok: true, job: job_id, mensagem: 'análise enviada — o worker de vídeo já pode renderizar' });
  }

  if (cmd === 'falhar') {
    const [job_id, lease_id, ...motivo] = a;
    await tool('fail_job', { job_id, lease_id, error: motivo.join(' ').slice(0, 500) || 'sem 3 pontos fortes', retryable: false });
    return out({ ok: true, job: job_id, mensagem: 'registrado: sem vídeo para este lead' });
  }

  console.log('uso: node analista.js status | proximo | concluir <job> <lease> <arquivo.json> | falhar <job> <lease> "<motivo>"');
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
