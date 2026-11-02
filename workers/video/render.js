// Monta a ficha do lead e renderiza o vídeo de diagnóstico do funil (MP4 vertical, com áudio).
// Modelo DX-001 em dx/ (Remotion): narração, 3D e tempos fixos; o lead só troca prints e textos.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const DX = path.join(__dirname, 'dx');

const capital = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

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

/** dados.json do DX-001 (contrato em dx/LEIA-ME.md), gravado ao lado dos prints. */
function escreverDadosDx(dir, ficha) {
  const pontos = [ficha.problema1, ficha.problema2, ficha.problema3].filter(Boolean)
    .map(({ kind, text, short, impacto, print, foco }) => ({ kind, text, short, impacto, print, foco: foco || null }));
  const dados = {
    empresa: ficha.empresa, url: ficha.url, cidade: ficha.cidade || undefined, segmento: ficha.segmento || undefined,
    especialidade: ficha.especialidade || undefined, diferencial: ficha.diferencial || undefined, cor: ficha.cor || undefined,
    pontos,
  };
  fs.writeFileSync(path.join(dir, 'dados.json'), JSON.stringify(dados, null, 2));
}

/** Chama dx/gerar_video.mjs com a pasta de trabalho como pasta do lead. Lead rejeitado = erro sem retry. */
async function renderizar(dir, ficha, { escala } = {}) {
  escreverDadosDx(dir, ficha);
  try {
    return await gerarDx(dir, escala);
  } catch (e) {
    if (e.retryable === false) throw e;
    // o render do Remotion às vezes falha sem motivo no lead (timeout de um quadro); uma segunda tentativa costuma passar
    console.warn('  vídeo falhou, tentando de novo:', e.message);
    return gerarDx(dir, escala);
  }
}

function gerarDx(dir, escala) {
  const arquivo = path.join(dir, 'video.mp4');
  const args = [path.join(DX, 'gerar_video.mjs'), dir, arquivo, ...(escala ? [`--escala=${escala}`] : [])];
  return new Promise((ok, err) => {
    const p = spawn(process.execPath, args, { cwd: DX, stdio: ['ignore', 'inherit', 'pipe'] });
    let saida = '';
    p.stderr.on('data', (b) => { saida += b; process.stderr.write(b); });
    p.on('error', err);
    p.on('close', (c) => {
      if (c === 0) return ok({ arquivo, duracao: JSON.parse(fs.readFileSync(path.join(DX, 'public', 'dx', 'timeline.json'), 'utf8')).duracao });
      const motivo = saida.split(/\r?\n/).filter((l) => l.trim() && !/^aviso:/.test(l)).join(' ').slice(0, 400) || `saiu com código ${c}`;
      // código 1 também é o de um render que quebrou; só "Lead rejeitado" e dados inválidos (2) não adiantam repetir
      err(Object.assign(new Error(`vídeo (DX-001): ${motivo}`), { retryable: c !== 2 && !/Lead rejeitado/.test(saida) }));
    });
  });
}

module.exports = { montarFicha, renderizar };
