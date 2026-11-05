#!/usr/bin/env node
// DX-001 — comando único: pasta do lead → MP4. Valida os dados, copia os prints, renderiza e finaliza para o WhatsApp.
//   node gerar_video.mjs <pasta_do_lead> [saida.mp4] [--escala=0.5]
// Saída: H.264, 1080×1920, 30 fps, CRF 22, yuv420p, faststart. Código de saída ≠ 0 com a lista de erros, sem gerar vídeo.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, closeSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opcoes = args.filter((a) => a.startsWith("--"));
const [pastaArg, saidaArg] = args.filter((a) => !a.startsWith("--"));
if (!pastaArg) {
  console.error("uso: node gerar_video.mjs <pasta_do_lead> [saida.mp4] [--escala=0.5]");
  process.exit(2);
}
// Windows limita caminhos a 260 caracteres: com o pacote fundo em pastas, o navegador do Remotion não abre (ENOENT)
if (process.platform === "win32" && RAIZ.length > 90) {
  console.error(`A pasta do modelo está num caminho longo demais (${RAIZ.length} caracteres; MAX_PATH do Windows). Mova para algo curto, como C:\\hzk-video.`);
  process.exit(2);
}
const pasta = resolve(pastaArg);
const saida = resolve(saidaArg ?? join(pasta, "video.mp4"));
const escala = (opcoes.find((o) => o.startsWith("--escala=")) ?? "--escala=1").split("=")[1];
// 8 abas em paralelo num PC de 8 núcleos falhou de forma intermitente (quadro do 3D não achado, timeout de 30 s); metade é estável
const concorrencia = (opcoes.find((o) => o.startsWith("--concorrencia=")) ?? "--concorrencia=50%").split("=")[1];

const dimensoesPng = (arq) => {
  const fd = openSync(arq, "r");
  const b = Buffer.alloc(24);
  readSync(fd, b, 0, 24, 0);
  closeSync(fd);
  if (b.toString("ascii", 1, 4) !== "PNG") throw new Error(`não é PNG: ${arq}`);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
};

const erros = [];
const avisos = [];
const lerDados = () => {
  try {
    return JSON.parse(readFileSync(join(pasta, "dados.json"), "utf8").replace(/^﻿/, ""));
  } catch (e) {
    console.error(`dados.json inválido ou ausente em ${pasta}: ${e.message}`);
    process.exit(2);
  }
};
const dados = lerDados();
const PRINTS = ["home.png", "pagina.png", "mobile.png"];
const dims = {};
for (const arq of PRINTS) {
  const c = join(pasta, arq);
  if (!existsSync(c)) erros.push(`falta ${arq}`);
  else dims[arq] = dimensoesPng(c);
}
for (const campo of ["empresa", "url"]) if (!String(dados[campo] ?? "").trim()) erros.push(`campo obrigatório vazio: ${campo}`);
if (!Array.isArray(dados.pontos) || dados.pontos.length !== 3) erros.push("pontos: são sempre 3");
(dados.pontos ?? []).forEach((p, i) => {
  const n = `ponto ${i + 1}`;
  for (const [campo, max] of [["text", 220], ["short", 48], ["impacto", 180]]) {
    const v = String(p[campo] ?? "").trim();
    if (!v) erros.push(`${n}: ${campo} vazio`);
    else if (v.length > max) erros.push(`${n}: ${campo} com ${v.length} caracteres (máximo ${max})`);
  }
  if (!PRINTS.includes(p.print)) return erros.push(`${n}: print deve ser ${PRINTS.join(", ")}`);
  const d = dims[p.print];
  if (p.foco && d) {
    if (!Array.isArray(p.foco) || p.foco.length !== 4 || p.foco.some((x) => typeof x !== "number") || p.foco[2] <= 0 || p.foco[3] <= 0)
      return erros.push(`${n}: foco deve ser [x, y, largura, altura] ou null`);
    const [x, y, w, h] = p.foco;
    const nx = Math.max(0, x), ny = Math.max(0, y);
    const nw = Math.min(w, d.w - nx), nh = Math.min(h, d.h - ny);
    if (nw <= 0 || nh <= 0) {
      avisos.push(`${n}: foco fora do print; mostrando o print inteiro`);
      p.foco = null;
    } else if (nw !== w || nh !== h || nx !== x || ny !== y) {
      avisos.push(`${n}: foco ajustado aos limites do print`);
      p.foco = [nx, ny, nw, nh];
    }
  } else p.foco ??= null;
  p.text = String(p.text).trim().replace(/[.\s]+$/, "");
});
for (const opcional of ["cidade", "especialidade", "diferencial", "cor", "segmento"]) {
  if (typeof dados[opcional] === "string") dados[opcional] = dados[opcional].trim() || undefined;
}
if (dados.cor && !/^#[0-9a-fA-F]{6}$/.test(dados.cor)) {
  avisos.push("cor inválida ignorada");
  dados.cor = undefined;
}
if (erros.length) {
  console.error("Lead rejeitado:\n- " + erros.join("\n- "));
  process.exit(1);
}
avisos.forEach((a) => console.warn("aviso:", a));

// pasta própria por render: dois leads podem rodar ao mesmo tempo sem misturar prints
const id = `${basename(pasta).replace(/[^\w-]/g, "_")}-${process.pid}`;
// public/ copiado para fora do OneDrive a cada render: o OneDrive troca os arquivos por "sob demanda" (reparse point),
// o Remotion os toma por atalho e tenta recriar o atalho no bundle (EPERM: symlink). A cópia lê o conteúdo e vira arquivo comum.
const publico = join(tmpdir(), `hzk-dx-${id}`);
const copiarPasta = (de, para) => {
  mkdirSync(para, { recursive: true });
  for (const nome of readdirSync(de)) {
    if (nome === "dx_leads") continue;
    const origem = join(de, nome);
    if (statSync(origem).isDirectory()) copiarPasta(origem, join(para, nome));
    else copyFileSync(origem, join(para, nome));
  }
};
rmSync(publico, { recursive: true, force: true });
copiarPasta(join(RAIZ, "public"), publico);
const pub = join(publico, "dx_leads", id);
mkdirSync(pub, { recursive: true });
PRINTS.forEach((a) => copyFileSync(join(pasta, a), join(pub, a)));
const props = join(pub, "props.json");
writeFileSync(props, JSON.stringify({ lead: { ...dados, pasta: `dx_leads/${id}`, dims } }));
mkdirSync(dirname(saida), { recursive: true });
const bruto = `${saida}.bruto.mp4`;
const inicio = Date.now();
const correr = (cmd, a) => {
  const r = spawnSync(cmd, a, { cwd: RAIZ, stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) {
    rmSync(publico, { recursive: true, force: true });
    rmSync(bruto, { force: true });
    console.error(`falhou: ${cmd}`);
    process.exit(r.status ?? 1);
  }
};
// garante o navegador do Remotion antes do render: na primeira vez, sem isto, o render achou o download pela metade
correr("npx", ["remotion", "browser", "ensure", "--log=error"]);
correr("npx", ["remotion", "render", "Diagnostico", `"${bruto}"`, `--props="${props}"`, "--codec=h264", "--crf=14", "--pixel-format=yuv420p",
  `--scale=${escala}`, "--log=error", `--concurrency=${concorrencia}`, "--timeout=120000", `--public-dir="${publico}"`]);
// ffmpeg que já vem com o Remotion: o PC não precisa de ffmpeg instalado
correr("npx", ["remotion", "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", `"${bruto}"`, "-vf", "scale=out_range=tv,format=yuv420p", "-c:v", "libx264", "-crf", "22", "-pix_fmt", "yuv420p", "-r", "30", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "48000", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", `"${saida}"`]);
rmSync(bruto, { force: true });
rmSync(publico, { recursive: true, force: true });
console.log(`pronto: ${saida} (${(statSync(saida).size / 1048576).toFixed(1)} MB em ${Math.round((Date.now() - inicio) / 1000)} s)`);
