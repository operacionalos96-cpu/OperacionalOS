/**
 * Gera os ícones do OperacionalOS a partir dos SVGs fonte (sem dependência nova: usa o sharp da raiz).
 *   icon.svg     desenho completo (40 px para cima)
 *   icon-24.svg  simplificado na grade de 24 (barra de tarefas em 100%)
 *   icon-16.svg  simplificado na grade de 16 (bandeja; também 20 e 32, que é o de 16 dobrado)
 * Saídas:
 *   desktop/build/icon.png (1024), desktop/build/icon.ico (16 a 256)
 *   desktop/abertura/icone.png (512) e icone.ico (janela, abertura, bandeja e bolinha)
 *   src/app/icon.svg (pequeno: aba do navegador), src/app/favicon.ico (16, 32, 48), src/app/apple-icon.png (180)
 *   desktop/build/prova-icone.png (folha de prova: todos os tamanhos sobre fundo claro e escuro)
 * Rodar na raiz do repositório: node desktop/build/gerar-icone.mjs
 */
import { createRequire } from "node:module"
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const aqui = path.dirname(fileURLToPath(import.meta.url))
const raiz = path.resolve(aqui, "..", "..")
const require = createRequire(path.join(raiz, "package.json"))
const sharp = require("sharp")

const grande = readFileSync(path.join(aqui, "icon.svg"), "utf8")
const de16 = readFileSync(path.join(aqui, "icon-16.svg"), "utf8")
const de24 = readFileSync(path.join(aqui, "icon-24.svg"), "utf8")
const pequeno = de16
const fonteDo = (lado) => (lado === 24 ? de24 : lado <= 32 ? de16 : grande)

/** Desenha o SVG direto no tamanho final (sem reduzir de uma imagem grande: fica mais nítido). */
async function png(svg, lado) {
  const vb = /viewBox="0 0 (\d+) (\d+)"/.exec(svg)
  const base = vb ? Number(vb[1]) : lado
  return sharp(Buffer.from(svg), { density: Math.max(1, (72 * lado) / base) })
    .resize(lado, lado, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer()
}

/** Arquivo .ico com cada tamanho guardado em PNG (aceito pelo Windows Vista em diante e pelo electron-builder). */
function ico(imagens) {
  const cab = Buffer.alloc(6 + 16 * imagens.length)
  cab.writeUInt16LE(0, 0)
  cab.writeUInt16LE(1, 2)
  cab.writeUInt16LE(imagens.length, 4)
  let desloc = cab.length
  imagens.forEach(({ lado, dados }, i) => {
    const o = 6 + 16 * i
    cab.writeUInt8(lado >= 256 ? 0 : lado, o)
    cab.writeUInt8(lado >= 256 ? 0 : lado, o + 1)
    cab.writeUInt8(0, o + 2)
    cab.writeUInt8(0, o + 3)
    cab.writeUInt16LE(1, o + 4)
    cab.writeUInt16LE(32, o + 6)
    cab.writeUInt32LE(dados.length, o + 8)
    cab.writeUInt32LE(desloc, o + 12)
    desloc += dados.length
  })
  return Buffer.concat([cab, ...imagens.map((x) => x.dados)])
}

async function icoDe(lados) {
  return ico(await Promise.all(lados.map(async (lado) => ({ lado, dados: await png(fonteDo(lado), lado) }))))
}

const TAMANHOS_APP = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256]

writeFileSync(path.join(aqui, "icon.png"), await png(grande, 1024))
writeFileSync(path.join(aqui, "icon.ico"), await icoDe(TAMANHOS_APP))
writeFileSync(path.join(raiz, "desktop", "abertura", "icone.png"), await png(grande, 512))
writeFileSync(path.join(raiz, "desktop", "abertura", "icone.ico"), await icoDe(TAMANHOS_APP))

// site: aba do navegador (pequeno), favicon e ícone do iPhone (fundo cheio: o iOS arredonda os cantos sozinho)
writeFileSync(path.join(raiz, "src", "app", "icon.svg"), pequeno)
writeFileSync(path.join(raiz, "src", "app", "favicon.ico"), await icoDe([16, 32, 48]))
const apple = grande.replace(/<g id="fundo">[\s\S]*?<\/g>/, '<rect width="256" height="256" fill="url(#corpo)" /><rect width="256" height="256" fill="url(#calor)" />').replace("scale(2.0)", "scale(1.8)")
writeFileSync(path.join(raiz, "src", "app", "apple-icon.png"), await png(apple, 180))

// folha de prova: cada tamanho em 1:1 sobre a barra de tarefas clara e a escura, e os pequenos ampliados 6x (pixel a pixel)
const LADOS = [16, 20, 24, 32, 40, 48, 64, 128, 256]
const FUNDOS = [
  { nome: "barra clara", cor: "#f3f3f3", texto: "#1b2432" },
  { nome: "barra escura", cor: "#1c1c1c", texto: "#e6e6e6" },
  { nome: "papel de parede azul", cor: "#2d5a9c", texto: "#ffffff" },
]
const largura = 40 + LADOS.reduce((s, l) => s + l + 28, 0)
const alturaFaixa = 256 + 60
const AMPLIA = 6
const ampliados = [16, 24, 32]
const alturaAmpliada = 32 * AMPLIA + 60
const altura = FUNDOS.length * alturaFaixa + FUNDOS.length * alturaAmpliada
const camadas = []
const rotulos = []
let y = 0
for (const f of FUNDOS) {
  camadas.push({ input: { create: { width: largura, height: alturaFaixa + alturaAmpliada, channels: 4, background: f.cor } }, left: 0, top: y })
  rotulos.push(`<text x="20" y="${y + 26}" fill="${f.texto}" font-family="Segoe UI, sans-serif" font-size="16" font-weight="600">${f.nome}</text>`)
  let x = 20
  for (const l of LADOS) {
    camadas.push({ input: await png(fonteDo(l), l), left: x, top: y + 44 + (256 - l) })
    rotulos.push(`<text x="${x + l / 2}" y="${y + alturaFaixa - 2}" fill="${f.texto}" font-family="Segoe UI, sans-serif" font-size="12" text-anchor="middle">${l}</text>`)
    x += l + 28
  }
  let xa = 20
  const ya = y + alturaFaixa + 20
  for (const l of ampliados) {
    const img = await sharp(await png(fonteDo(l), l)).resize(l * AMPLIA, l * AMPLIA, { kernel: "nearest" }).png().toBuffer()
    camadas.push({ input: img, left: xa, top: ya })
    rotulos.push(`<text x="${xa + (l * AMPLIA) / 2}" y="${ya + l * AMPLIA + 20}" fill="${f.texto}" font-family="Segoe UI, sans-serif" font-size="12" text-anchor="middle">${l} px ampliado ${AMPLIA}x</text>`)
    xa += l * AMPLIA + 40
  }
  y += alturaFaixa + alturaAmpliada
}
const textos = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}">${rotulos.join("")}</svg>`)
await sharp({ create: { width: largura, height: altura, channels: 4, background: "#ffffff" } })
  .composite([...camadas, { input: textos, left: 0, top: 0 }])
  .png()
  .toFile(path.join(aqui, "prova-icone.png"))

console.log("ícones gerados:", TAMANHOS_APP.join(", "), "| prova em desktop/build/prova-icone.png")
