// DX-001 v3.2 — modelo do vídeo de diagnóstico (112,6 s). Estrutura fixa + dados do lead vindos só das props.
// Blocos (timeline.json > blocos): gancho · Hub 3D · rua 3D · convite · pausa da dica · 3 pontos na tela 3D · fechamento.
// v3.2 (Gabriel, 03/11): tipografia cinética na abertura, resultado de busca com cursor e clique, pool de transições
// (match cut, whip pan, scroll rápido, expansão geométrica) no lugar da máscara única, legenda palavra por palavra com
// impacto na palavra laranja, risco diagonal, CTA carimbado e tela congelada logo depois do obturador final.
// Versões anteriores: logs/checkpoints/personagem/dx-Diagnostico-v31.tsx, dx-Diagnostico-v21-114s.tsx.
import React from "react";
import { AbsoluteFill, Audio, Easing, Freeze, Img, OffthreadVideo, Sequence, spring, staticFile } from "remotion";
import cantos from "../../public/dx/cantos.json";
import tl from "../../public/dx/timeline.json";
import { C, FONTE, Fundo, Palavras, PorQueNao, VAIVEM, ent, janela, mix, useT } from "../com001/base";
import { FaixaTeste, JanelaSite, Lead, Ponto, VistaPrint, fonteQueCabe, matrizTela, src } from "./base";

export const DX = { fps: tl.fps, quadros: tl.quadros };
const B = tl.blocos as unknown as Record<string, [number, number]>;
const MUSICA = (tl as unknown as { musica: null | { arquivo: string; duracao: number } }).musica;
// [início, fim] de cada placa 3D no vídeo: índice do quadro = (t - início) × fps.
// Hub e rua tocam deslocados (scene.py > TRECHOS); dica e ponto foram renderizados no tempo global.
// A rua começa 0,05 s antes (22,35) para entrar junto com o fim do whip pan; a diferença não mexe nos gestos.
const PLACA = { hub: [12.2, 22.2], rua: [22.35, 31.95], dica: [40.4, 49.0], ponto: [48.6, 82.4] } as const;
type NomeTela = "home" | "mobile" | "analise";
const CANTOS = cantos as Record<NomeTela, number[][]>;
const quadroTela = (nome: NomeTela, t: number) => {
  const ini = nome === "analise" ? PLACA.ponto[0] : PLACA.hub[0];
  return CANTOS[nome][Math.max(0, Math.min(CANTOS[nome].length - 1, Math.round((t - ini) * tl.fps)))];
};
// fechamento: os tempos foram escritos para o roteiro de 114 s (início 82,4); a v3 começa 0,4 s antes
const S = B.fecho[0] - 82.4;

// Molas: MOLA é a entrada padrão (passa ~10% e assenta); IMPACTO é a batida da palavra laranja (Gabriel: mass 1,
// stiffness 150, damping 12); CARIMBO é a entrada agressiva do CTA final.
const MOLA = { mass: 1, stiffness: 120, damping: 14 };
const IMPACTO = { mass: 1, stiffness: 150, damping: 12 };
const CARIMBO = { mass: 1, stiffness: 380, damping: 16 };
const molaCom = (cfg: typeof MOLA) => (t: number, t0: number) =>
  t < t0 ? 0 : spring({ frame: Math.round((t - t0) * tl.fps), fps: tl.fps, config: cfg });
const mola = molaCom(MOLA), batida = molaCom(IMPACTO), carimbo = molaCom(CARIMBO);
const EXPO = Easing.out(Easing.exp);

// ---------- tempos de coreografia (o som usa os mesmos) ----------
// busca: digitação em até 1,15 s (URLs longas aceleram), Enter, resultado, cursor viaja e clica, expansão revela o site
const DIGITA = 3.0;
const velDigita = (lead: Lead) => Math.max(24, lead.url.length / 1.15);
const BUSCA = { enter: 4.25, resultado: 4.35, cursor: 4.4, clique: 4.95 };
const ALVO_CLIQUE: [number, number] = [430, 948];
const HUD_POUSO = [28.72, 28.84, 28.96, 29.08];  // hora, sinal, wi-fi, bateria voam de fora e pousam na barra
const NOTIF_POUSO = 29.25;
const POPUP_POUSO = [29.75, 29.9, 30.05];
const LINHA = { desenha: 33.95, estica: 34.95, reta: 35.72 };  // convite: emaranhada -> esticando -> reta
const fala = (txt: string) => tl.legendas.find((l) => l.texto === txt) ?? { t0: 0, t1: 0 };
// fechamento: "errado" é riscado no fim de "que o seu site está errado." e a cena é varrida antes de "Mostram onde..."
const RISCO = { ini: fala("que o seu site está errado.").t1 - 0.45, varre: fala("Mostram onde ele pode").t0 - 0.2 };
const OBTURADOR_DICA = 42.85;
const SAIDA_DICA = 48.5;
const LOGO_FINAL = 103.7 + S + 0.05;  // o logo carimba assim que a cartela é revelada; o WhatsApp vem 0,5 s depois
const OBTURADOR_FINAL = B.fecho[1] - 0.55;  // depois dele a tela congela e o vídeo acaba

// ---------- pool de transições (Gabriel, v3.2: nada de máscara única; cada corte usa a que serve à cena) ----------
// whipX/whipY: câmera virtual dá um tranco lateral/vertical com motion blur direcional (som: ar denso, "whip").
// scrollY/scrollX: a cena é puxada como um feed, ease-in rápido e chegada elástica (som: dedo na tela, "swipe").
// circulo: expansão geométrica grafite com borda laranja a partir de um ponto, contrai revelando a próxima cena.
// cartao: match cut — um bloco da cena cresce até virar cortina e recua no formato do próximo elemento.
// Azul elétrico #3861F2 fica fora (regra IDENTIDADE): a expansão usa grafite e laranja.
type Caixa = [number, number, number, number];  // x, y, largura, altura
type Trans =
  | { c: number; tipo: "whipX" | "whipY" | "scrollY" | "scrollX" }
  | { c: number; tipo: "circulo"; de: [number, number]; para: [number, number]; cor: string }
  | { c: number; tipo: "cartao"; de: Caixa; para: Caixa; corDe: string; corPara: string };
const TRANS: Trans[] = [
  { c: BUSCA.clique + 0.27, tipo: "circulo", de: ALVO_CLIQUE, para: [540, 520], cor: C.deep },
  { c: 22.35, tipo: "whipX" },
  { c: 31.75, tipo: "scrollY" },
  { c: B.pontos[0], tipo: "circulo", de: [1080, 820], para: [540, 520], cor: C.deep },
  ...tl.pontos.slice(1).map((p): Trans => ({ c: p.ini, tipo: "circulo", de: [87, 130], para: [87, 130], cor: C.orange })),
  { c: B.fecho[0], tipo: "whipY" },
  { c: 90.4 + S, tipo: "scrollX" },
  { c: 100.3 + S, tipo: "circulo", de: [540, 960], para: [540, 960], cor: C.deep },
  { c: 103.7 + S, tipo: "cartao", de: [170, 560, 740, 210], para: [220, 470, 640, 122], corDe: C.graphite, corPara: C.deep },
];
const IDA = 0.24, VOLTA = 0.34;  // tempos de cobrir e de revelar

// Som (regras de Gabriel, 03/11): cada elemento que aparece tem o seu som, variados; interface sintetizada em código
// (sintetizar_sons.py); gravado só o mundo real (rua, carro, passos). Volumes relativos: voz 1; interface 0,2–0,55;
// fundo diegético ≥ 18 dB abaixo da voz. Transição: quanto mais rápida, mais seco e baixo o som; whip pede ar denso.
const somTrans = (tr: Trans): [string, number, number][] => {
  if (tr.tipo === "whipX" || tr.tipo === "whipY") return [["whip", tr.c - 0.25, 0.5]];
  if (tr.tipo === "scrollY" || tr.tipo === "scrollX") return [["swipe", tr.c - 0.2, 0.45]];
  if (tr.tipo === "circulo") return tr.cor === C.orange ? [["passagem", tr.c - 0.3, 0.22], ["pop", tr.c + VOLTA - 0.05, 0.25]] : [["passagem", tr.c - 0.3, 0.3]];
  return [["passagem", tr.c - 0.3, 0.3]];
};
// legendas: blocos repetidos em título na tela não aparecem (Gabriel: "remova legenda redundante")
const OCULTAS = new Set(["Seu negócio tem *valor*.", "Por que *não*", "ver esse caminho do jeito", "que *essa pessoa* vê?",
  "dar esse *próximo passo*?", "HZK.", "O digital a favor", "do que *importa* para você."]);
type Palavra = { txt: string; quente: boolean; t: number };
const palavras = (l: { t0: number; t1: number; texto: string }): Palavra[] => {
  const pecas: { txt: string; quente: boolean }[] = [];
  l.texto.split(/(\*[^*]+\*)/).forEach((p) => {
    if (p.startsWith("*")) pecas.push({ txt: p.slice(1, -1), quente: true });
    else p.split(" ").filter(Boolean).forEach((w) => pecas.push({ txt: w, quente: false }));
  });
  const total = pecas.reduce((a, p) => a + p.txt.length + 1, 0);
  let acum = 0;
  return pecas.map((p) => { const t = l.t0 + (l.t1 - l.t0) * 0.92 * (acum / total); acum += p.txt.length + 1; return { ...p, t }; });
};
const legendaVisivel = (l: { texto: string }, t: number) => !OCULTAS.has(l.texto) && (t < B.dica[0] || t >= B.dica[1]);

const SONS: [string, number, number][] = [
  ...TRANS.reduce((acc: [string, number, number][], tr) => acc.concat(somTrans(tr)), []),
  // abertura: um tique por palavra do título, a barra pousa, Enter, o resultado nasce, o cursor clica
  ...[0.5, 0.57, 0.75, 0.82].map((t, i): [string, number, number] => [`tique${i}`, t, 0.4]), ["impacto", 0.95, 0.3],
  ["pop2", 2.62, 0.3], ["enter", BUSCA.enter, 0.5], ["pop", BUSCA.resultado + 0.12, 0.32], ["clique", BUSCA.clique, 0.6],
  ["impacto", 5.6, 0.4],
  ["passagem", 11.9, 0.45], ["passos", 12.6, 0.4], ["passos", 22.4, 0.3], ["carro", 24.6, 0.06],  // carro: 19 dB abaixo da voz no pico (medido)
  // celular: cada peça do HUD que pousa na tela tem o seu som (vidro, notificação, pops alternados)
  ...HUD_POUSO.map((t): [string, number, number] => ["vidro", t, 0.3]), ["notificacao", NOTIF_POUSO, 0.42],
  ...POPUP_POUSO.map((t, i): [string, number, number] => [i % 2 ? "pop2" : "pop", t, 0.3]),
  // convite: título, a linha emaranhada se desenha, estica (corda) e fica reta (ding); a lista cai em cascata
  // a subida antecipa o whip do Hub para a rua; o cartão "Por que não?" assenta com impacto depois da rolagem
  // (sem eles ficavam 1,1 s e 1,2 s de silêncio nos cortes, medido na v3.2)
  ["sobe", 21.35, 0.22], ["impacto", 31.98, 0.38], ["traco", LINHA.desenha, 0.18], ["corda", LINHA.estica, 0.38], ["ding", LINHA.reta, 0.3],
  ...[36.9, 37.05, 37.2].map((t): [string, number, number] => ["tique", t, 0.5]),
  // pausa da dica: o cenário recua (suave, a espreitada é lenta), título, obturador em "print", volta, saída
  ["sobe", 40.4, 0.25], ["passagem", 40.7, 0.22],
  ["pop", 41.0, 0.42], ["tique", 41.9, 0.4], ["obturador", OBTURADOR_DICA, 0.6],
  ["pop", 46.45, 0.38], ["passagem", 48.2, 0.45],
  // em cada ponto: título (com som), contorno; o exemplo entra em silêncio (variação de ritmo); impacto
  ...([[0.3, "pop", 0.3], [2.2, "traco", 0.22], [6.2, "toque", 0.22]] as [number, string, number][])
    .reduce((acc: [string, number, number][], [d, a, v]) => acc.concat(tl.pontos.map((p): [string, number, number] => [a, p.ini + d, v])), []),
  ["marcador", RISCO.ini, 0.6], ["espalha", RISCO.varre, 0.42],
  ...[93.4, 95.4, 97.1].map((t): [string, number, number] => ["toque", t + S, 0.35]),
  ["impacto", 100.4 + S, 0.35],
  ["impacto", LOGO_FINAL, 0.5], ["impacto", LOGO_FINAL + 0.5, 0.4], ["pop2", LOGO_FINAL + 0.5, 0.35],
  ["marca", fala("HZK.").t0, 0.5], ["tique", fala("HZK.").t0 + 1.0, 0.3],
  ["obturador", OBTURADOR_FINAL, 0.55],
  // palavra laranja da legenda: micro-impacto no instante em que ela bate
  ...tl.legendas.filter((l) => legendaVisivel(l, l.t0)).reduce((acc: [string, number, number][], l) =>
    acc.concat(palavras(l).filter((p) => p.quente).map((p): [string, number, number] => ["impacto", p.t, 0.16])), []),
];
// ambientes [arquivo, início, fim, volume sem voz, quanto some sob a voz, duração]. A rua é o lugar real da cena.
// Música (ElevenLabs Music, EQ em gerar_timeline.py): ~18 dB abaixo da voz enquanto ela fala, ~6 dB nas pausas (medido).
const AMBIENTES: [string, number, number, number, number, number][] = [
  ["rua.mp3", 22.4, 32.0, 0.22, 0.6, 30],
  ...(MUSICA ? [[`${MUSICA.arquivo}`, B.dica[0], B.fecho[1], 0.45, 0.75, MUSICA.duracao] as [string, number, number, number, number, number]] : []),
];
const sobVoz = (t: number) => Math.max(0, ...tl.falas.map((f) => janela(t, f.ini - 0.3, f.fim + 0.3, 0.3)));

// ---------- legenda palavra por palavra ----------
const PalavraLeg: React.FC<{ p: Palavra }> = ({ p }) => {
  const t = useT();
  const k = ent(t, p.t - 0.02, 0.14, EXPO);
  const b = p.quente ? batida(t, p.t) : 1;
  return (
    <span style={{ display: "inline-block", marginRight: p.quente ? "0.36em" : "0.26em", marginLeft: p.quente ? "0.1em" : 0, color: p.quente ? C.orange : C.white, opacity: k, transformOrigin: "center 70%",
      transform: `translateY(${(1 - k) * 14}px) scale(${p.quente ? mix(1.2, 1, b) : 1})` }}>{p.txt}</span>
  );
};

const LegendaV3: React.FC = () => {
  const t = useT();
  const atual = tl.legendas.find((l) => t >= l.t0 - 0.04 && t < l.t1 + 0.12);
  if (!atual || !legendaVisivel(atual, t)) return null;
  const nosPontos = t >= B.pontos[0] && t < B.pontos[1];
  return (
    <div style={{ position: "absolute", left: 60, right: 60, top: nosPontos ? 1745 : 1420, textAlign: "center", fontFamily: FONTE, fontWeight: 800,
      fontSize: nosPontos ? 46 : 52, lineHeight: 1.12, color: C.white, WebkitTextStroke: `11px ${C.deep}`, paintOrder: "stroke fill" }}>
      {palavras(atual).map((p, i) => <PalavraLeg key={`${atual.t0}-${i}`} p={p} />)}
    </div>
  );
};

// poeira de luz: movimento secundário discreto (regra AMBIENTE), determinístico
const Poeira: React.FC<{ k: number }> = ({ k }) => {
  const t = useT();
  return (
    <AbsoluteFill style={{ opacity: k, pointerEvents: "none" }}>
      {Array.from({ length: 18 }, (_, i) => {
        const x = (i * 197) % 1080, v = 14 + (i % 5) * 6, y = 1920 - ((i * 331 + t * v) % 2100), r = 2 + (i % 4);
        return <div key={i} style={{ position: "absolute", left: x + Math.sin(t * 0.6 + i) * 18, top: y, width: r * 2, height: r * 2, borderRadius: r,
          background: i % 6 === 0 ? C.orange : C.mineral, opacity: 0.16 + (i % 3) * 0.06 }} />;
      })}
    </AbsoluteFill>
  );
};

// câmera que respira (~0,5 Hz, poucos pixels): o 3D e o print encaixado mexem juntos, nunca tremor
const Respira: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const t = useT();
  return <AbsoluteFill style={{ transform: `translate(${Math.sin(t * 2.9) * 4}px, ${Math.cos(t * 2.3) * 3}px) scale(1.012)` }}>{children}</AbsoluteFill>;
};

// ---------- transições ----------
// deslocamento e motion blur da câmera virtual nos whips e scrolls (aplicados a toda a cena, não à legenda)
const camera = (t: number) => {
  for (const tr of TRANS) {
    if (!(tr.tipo === "whipX" || tr.tipo === "whipY" || tr.tipo === "scrollX" || tr.tipo === "scrollY")) continue;
    const whip = tr.tipo.startsWith("whip");
    const ida = whip ? 0.2 : 0.22, volta = whip ? 0.32 : 0.42;
    if (t < tr.c - ida || t > tr.c + volta) continue;
    const dist = tr.tipo.endsWith("X") ? (whip ? 900 : 1080) : (whip ? 1100 : 1920);
    const sai = ent(t, tr.c - ida, ida, Easing.in(Easing.cubic));
    const entra = ent(t, tr.c, volta, whip ? EXPO : Easing.out(Easing.back(1.5)));
    const d = t < tr.c ? -dist * sai : dist * (1 - entra);
    const pico = t < tr.c ? sai : 1 - Math.min(1, entra);
    const blur = (whip ? 70 : 14) * Math.max(0, pico);
    return tr.tipo.endsWith("X") ? { x: d, y: 0, bx: blur, by: 0 } : { x: 0, y: d, bx: 0, by: blur };
  }
  return { x: 0, y: 0, bx: 0, by: 0 };
};

const Cortina: React.FC = () => {
  const t = useT();
  const tr = TRANS.find((x) => (x.tipo === "circulo" || x.tipo === "cartao") && t > x.c - IDA && t < x.c + VOLTA);
  if (!tr) return null;
  const cobre = ent(t, tr.c - IDA, IDA, Easing.in(Easing.cubic)), revela = ent(t, tr.c, VOLTA, EXPO);
  if (tr.tipo === "circulo") {
    const [x, y] = t < tr.c ? tr.de : tr.para;
    const r = 2300 * (t < tr.c ? cobre : 1 - revela);
    return (
      <div style={{ position: "absolute", left: x - r, top: y - r, width: 2 * r, height: 2 * r, borderRadius: "50%", background: tr.cor,
        boxShadow: `0 0 0 ${tr.cor === C.orange ? 0 : 16}px ${C.orange}, 0 30px 90px rgba(0,0,0,.45)`, zIndex: 8 }} />
    );
  }
  if (tr.tipo !== "cartao") return null;
  // match cut: o bloco vem para a frente (z-index), cresce até cobrir a tela e recua no formato do próximo elemento
  const cheio: Caixa = [-40, -40, 1160, 2000];
  const [a, b, k] = t < tr.c ? [tr.de, cheio, cobre] : [cheio, tr.para, revela];
  const q = a.map((v, i) => mix(v, b[i], k));
  const raio = t < tr.c ? mix(34, 0, cobre) : mix(0, 30, revela);
  const cor = t < tr.c ? tr.corDe : tr.corPara;
  return <div style={{ position: "absolute", left: q[0], top: q[1], width: q[2], height: q[3], borderRadius: raio, background: cor, zIndex: 8,
    opacity: t < tr.c ? 1 : 1 - ent(t, tr.c + VOLTA - 0.12, 0.12), border: `2px solid ${C.line}` }} />;
};

const Dados: React.FC<{ lead: Lead; t0: number; sai: number; top: number }> = ({ lead, t0, sai, top }) => {
  const t = useT();
  const extras = [lead.cidade, lead.especialidade, lead.diferencial].filter(Boolean) as string[];
  const tam = fonteQueCabe(lead.empresa, 920, 72, 2, 34);
  const nome = mola(t, t0), barra = ent(t, t0 - 0.1, 0.5, VAIVEM), fora = ent(t, sai, 0.4, VAIVEM);
  return (
    <div style={{ position: "absolute", left: 80, right: 80, top, fontFamily: FONTE, opacity: 1 - fora, transform: `translateY(${-fora * 40}px)` }}>
      <div style={{ width: 120, height: 8, borderRadius: 4, background: lead.cor ?? C.orange, marginBottom: 18, transformOrigin: "left", transform: `scaleX(${barra})` }} />
      <div style={{ color: C.white, fontWeight: 900, fontSize: tam, lineHeight: 1.1, letterSpacing: -0.5, opacity: Math.min(1, nome * 1.6),
        transformOrigin: "left bottom", transform: `translateY(${(1 - nome) * 50}px) scale(${mix(0.86, 1, nome)})` }}>{lead.empresa}</div>
      {extras.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 18 }}>
          {extras.map((e, i) => {
            const k = mola(t, t0 + 0.35 + i * 0.15);
            return <span key={i} style={{ padding: "8px 18px", borderRadius: 22, border: `2px solid ${i === 0 ? C.orange : C.line}`, background: "rgba(27,36,50,.8)",
              color: C.mineral, fontWeight: 700, fontSize: 28, opacity: Math.min(1, k * 1.5), transform: `translateY(${(1 - k) * -46}px) rotate(${(1 - k) * (i % 2 ? 6 : -6)}deg)` }}>{e}</span>;
          })}
        </div>
      )}
    </div>
  );
};

// retângulo envolvente dos cantos de uma tela num instante: alvo do "voo" da janela da abertura
const caixa = (q: number[]) => {
  const xs = [q[0], q[2], q[4], q[6]], ys = [q[1], q[3], q[5], q[7]];
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
};

// tipografia cinética: cada palavra nasce inclinada 15° no eixo X e em 50%, assentando com ease-out-expo
const TituloCinetico: React.FC<{ linhas: { txt: string; t0: number; quente?: boolean }[][]; tam: number }> = ({ linhas, tam }) => {
  const t = useT();
  return (
    <div style={{ fontFamily: FONTE, fontWeight: 900, fontSize: tam, lineHeight: 1.08, letterSpacing: -tam * 0.012, textAlign: "center", perspective: 900 }}>
      {linhas.map((l, j) => (
        <div key={j}>
          {l.map((w, i) => {
            const k = ent(t, w.t0, 0.75, EXPO);
            return <span key={i} style={{ display: "inline-block", margin: `0 ${tam * 0.13}px`, color: w.quente ? C.orange : C.white, opacity: Math.min(1, k * 1.8),
              transformOrigin: "center bottom", transform: `rotateX(${15 * (1 - k)}deg) scale(${mix(0.5, 1, k)}) translateY(${(1 - k) * 20}px)` }}>{w.txt}</span>;
          })}
        </div>
      ))}
    </div>
  );
};

const Cursor: React.FC = () => {
  const t = useT();
  const k = ent(t, BUSCA.cursor, BUSCA.clique - BUSCA.cursor - 0.05, Easing.bezier(0.45, 0, 0.2, 1));
  // trajeto em curva de Bézier quadrática: entra pela direita de baixo e chega ao título do resultado
  const [x0, y0, cx, cy, [x1, y1]] = [930, 1560, 1010, 1040, ALVO_CLIQUE];
  const x = (1 - k) ** 2 * x0 + 2 * (1 - k) * k * cx + k * k * x1, y = (1 - k) ** 2 * y0 + 2 * (1 - k) * k * cy + k * k * y1;
  const aperta = 1 - 0.18 * janela(t, BUSCA.clique - 0.02, BUSCA.clique + 0.12, 0.05);
  const vis = ent(t, BUSCA.cursor, 0.15) * (1 - ent(t, BUSCA.clique + 0.2, 0.1));
  return (
    <svg width="64" height="64" viewBox="0 0 24 24" style={{ position: "absolute", left: x - 6, top: y - 4, opacity: vis, transform: `scale(${aperta})`, transformOrigin: "6px 4px", zIndex: 6,
      filter: "drop-shadow(0 6px 10px rgba(0,0,0,.45))" }}>
      <path d="M4 2l14 9.5-6.2 1.3 3.7 7.1-2.6 1.3-3.6-7.2L4.6 18z" fill={C.white} stroke={C.deep} strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
};

const Gancho: React.FC<{ lead: Lead }> = ({ lead }) => {
  const t = useT();
  const sobe = ent(t, 2.2, 1.0, VAIVEM);
  const coberto = t >= BUSCA.clique + 0.27;  // a expansão do clique cobre a busca; daqui em diante só o site
  const busca = mola(t, 2.6);
  const digitado = lead.url.slice(0, Math.max(0, Math.floor((t - DIGITA) * velDigita(lead))));
  const cursorTexto = t > 2.9 && t < BUSCA.enter && Math.floor(t * 3) % 2 === 0;
  const aperta = 1 - 0.04 * janela(t, BUSCA.enter, BUSCA.enter + 0.18, 0.06);  // a barra afunda no Enter
  const lupa = ent(t, BUSCA.enter, 0.2);
  const res = mola(t, BUSCA.resultado);
  const clica = 1 - 0.05 * janela(t, BUSCA.clique - 0.02, BUSCA.clique + 0.16, 0.06);  // o resultado afunda 5% no clique
  const site = mola(t, BUSCA.clique + 0.3);
  const deriva = Math.sin(t * 0.7) * 5;
  const urlTam = fonteQueCabe(lead.url, 720, 44, 1, 24);
  const descr = [lead.especialidade, lead.cidade].filter(Boolean).join(" · ") || lead.url;
  // voo: de 12,2 a 13,2 s a janela vai para o lugar da tela "home" do Hub (match cut com o 3D)
  const voo = ent(t, 12.2, 1.0, VAIVEM);
  const alvo = caixa(quadroTela("home", 13.2));
  const x0 = 70, y0 = 200 + deriva, w0 = 940;
  const esc = mix(1, alvo.w / w0, voo);
  return (
    <AbsoluteFill style={{ opacity: 1 - ent(t, 13.0, 0.35) }}>
      {!coberto && (
        <>
          <div style={{ position: "absolute", top: mix(620, 300, sobe), left: 40, right: 40, transform: `scale(${mix(1, 0.78, sobe)})`, opacity: 1 - ent(t, 4.0, 0.4) }}>
            <TituloCinetico tam={138} linhas={[[{ txt: "Seu", t0: 0.5 }, { txt: "negócio", t0: 0.57 }], [{ txt: "tem", t0: 0.75 }, { txt: "valor.", t0: 0.82, quente: true }]]} />
          </div>
          <div style={{ position: "absolute", top: 720, left: 90, width: 900, height: 108, borderRadius: 54, background: C.mineral, display: "flex", alignItems: "center", gap: 24, padding: "0 42px",
            fontFamily: FONTE, fontSize: urlTam, fontWeight: 600, color: C.graphite, opacity: Math.min(1, busca * 1.4), transform: `translateY(${(1 - busca) * 46}px) scale(${aperta})`,
            boxShadow: `0 30px 80px rgba(0,0,0,.45), 0 0 0 ${4 * lupa}px rgba(234,91,37,.55)`, overflow: "hidden", whiteSpace: "nowrap" }}>
            <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke={C.orange} strokeWidth="2.6" strokeLinecap="round" style={{ flex: "none" }}><circle cx="10.5" cy="10.5" r="7" /><path d="M16 16l5.5 5.5" /></svg>
            <span>{digitado}</span>
            <span style={{ width: 3, height: urlTam * 1.1, background: C.orange, opacity: cursorTexto ? 1 : 0, marginLeft: -18 }} />
          </div>
          {/* resultado da busca: nasce com mola abaixo da barra; afunda 5% no clique */}
          <div style={{ position: "absolute", top: 862, left: 90, width: 900, padding: "26px 34px", borderRadius: 28, background: C.white, fontFamily: FONTE,
            boxShadow: "0 30px 70px rgba(0,0,0,.4)", opacity: Math.min(1, res * 1.6), transform: `translateY(${(1 - res) * 60}px) scale(${mix(0.9, 1, Math.min(1, res)) * clica})` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 24, color: "#5F6368", fontWeight: 600 }}>
              <span style={{ width: 34, height: 34, borderRadius: 17, background: lead.cor ?? C.orange, flex: "none" }} />
              <span style={{ overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{lead.url}</span>
            </div>
            <div style={{ marginTop: 10, fontSize: fonteQueCabe(lead.empresa, 830, 40, 1, 26), fontWeight: 800, color: "#1A3D8F", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lead.empresa}</div>
            <div style={{ marginTop: 6, fontSize: 24, color: "#4D5156", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{descr}</div>
          </div>
          <Cursor />
        </>
      )}
      {coberto && (
        <div style={{ position: "absolute", left: mix(x0, alvo.x, voo), top: mix(y0, alvo.y, voo), perspective: 1600, opacity: Math.min(1, site * 1.5), transformOrigin: "0 0", transform: `scale(${esc})` }}>
          <div style={{ transform: `rotateX(${mix(14, 3, Math.min(1, site)) * (1 - voo)}deg) translateY(${(1 - site) * 90}px) scale(${mix(0.92, 1, site)})` }}>
            <JanelaSite url={lead.url} w={w0} h={640}><Img src={src(lead, "home.png")} style={{ width: w0, display: "block" }} /></JanelaSite>
          </div>
        </div>
      )}
      <Dados lead={lead} t0={5.6} sai={11.0} top={920} />
    </AbsoluteFill>
  );
};

// print aplicado na tela 3D por homografia (cantos exportados do Blender, quadro a quadro)
const NaTela: React.FC<{ nome: NomeTela; t: number; w: number; h: number; children: React.ReactNode }> = ({ nome, t, w, h, children }) => (
  <div style={{ position: "absolute", left: 0, top: 0, width: w, height: h, overflow: "hidden", background: "#fff", transformOrigin: "0 0",
    transform: matrizTela(w, h, quadroTela(nome, t)) }}>{children}</div>
);

// Peça de HUD que voa de fora do aparelho e pousa no lugar (v3.1, Gabriel: montagem de fora para dentro): parte de
// (dx, dy) px, acelera, passa um pouco do ponto (mola) e assenta; o som de pouso está em SONS no mesmo instante.
const Voa: React.FC<{ t0: number; dx: number; dy: number; rot?: number; style: React.CSSProperties; children: React.ReactNode }> = ({ t0, dx, dy, rot = 0, style, children }) => {
  const t = useT();
  const k = mola(t, t0 - 0.28);  // chega (k≈1) por volta de t0, quando toca o som
  return <div style={{ position: "absolute", ...style, opacity: Math.min(1, k * 2.5), transform: `translate(${(1 - k) * dx}px, ${(1 - k) * dy}px) rotate(${(1 - k) * rot}deg) scale(${mix(0.7, 1, Math.min(1, k))})` }}>{children}</div>;
};

const IconesStatus: React.FC = () => (
  <>
    <Voa t0={HUD_POUSO[0]} dx={-320} dy={-60} rot={-20} style={{ left: 40, top: 14, fontFamily: FONTE, fontWeight: 700, fontSize: 21, color: "#111" }}>9:41</Voa>
    <Voa t0={HUD_POUSO[1]} dx={300} dy={-90} rot={25} style={{ left: 330, top: 18 }}>
      <svg width="26" height="16" viewBox="0 0 26 16">{[0, 1, 2, 3].map((i) => <rect key={i} x={i * 7} y={12 - i * 4} width="5" height={4 + i * 4} rx="1.2" fill="#111" />)}</svg>
    </Voa>
    <Voa t0={HUD_POUSO[2]} dx={320} dy={-30} rot={30} style={{ left: 364, top: 17 }}>
      <svg width="22" height="16" viewBox="0 0 24 18" fill="none" stroke="#111" strokeWidth="2.6" strokeLinecap="round"><path d="M2 6a15 15 0 0 1 20 0" /><path d="M6 10a9 9 0 0 1 12 0" /><circle cx="12" cy="14.5" r="1.6" fill="#111" /></svg>
    </Voa>
    <Voa t0={HUD_POUSO[3]} dx={340} dy={40} rot={-25} style={{ left: 394, top: 18 }}>
      <svg width="34" height="16" viewBox="0 0 34 16"><rect x="1" y="1" width="28" height="14" rx="4" fill="none" stroke="#111" strokeWidth="2" /><rect x="4" y="4" width="19" height="8" rx="2" fill="#111" /><rect x="30.5" y="5" width="2.5" height="6" rx="1" fill="#111" /></svg>
    </Voa>
  </>
);

const Notificacao: React.FC<{ t1: number }> = ({ t1 }) => {
  const t = useT();
  const sai = ent(t, t1, 0.35, VAIVEM);
  return (
    <Voa t0={NOTIF_POUSO} dx={0} dy={-420} rot={-4} style={{ left: 14, right: 14, top: 62 }}>
      <div style={{ padding: "14px 16px", borderRadius: 24, background: "rgba(245,245,242,.97)", boxShadow: "0 14px 34px rgba(0,0,0,.28)", display: "flex", gap: 14, alignItems: "center",
        fontFamily: FONTE, transform: `translateY(${-sai * 160}px)`, opacity: 1 - sai }}>
        <span style={{ width: 52, height: 52, borderRadius: 14, background: C.orange, flex: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill={C.white}><path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-4 3v-3H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" /></svg>
        </span>
        <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <span style={{ fontWeight: 800, fontSize: 21, color: "#111" }}>Carla <span style={{ fontWeight: 500, color: "#777", fontSize: 18 }}>· agora</span></span>
          <span style={{ fontWeight: 500, fontSize: 20, color: "#222", lineHeight: 1.2 }}>Já abriu o site que te indiquei? 👀</span>
        </span>
      </div>
    </Voa>
  );
};

const Celular: React.FC<{ lead: Lead; k: number }> = ({ lead, k }) => {
  const t = useT();
  // leve rolagem: mostra que a pessoa está navegando, sem esconder a primeira tela
  const rola = 60 * ent(t, 30.4, 1.6, VAIVEM);
  return (
    <div style={{ position: "absolute", left: 300, top: 250, width: 480, height: 1020, borderRadius: 66, background: "#10151F", padding: 14, boxShadow: "0 50px 120px rgba(0,0,0,.45), inset 0 0 0 3px #3B4252",
      opacity: Math.min(1, k * 1.5), transform: `translateY(${(1 - k) * 160}px) scale(${mix(0.9, 1, k)}) rotate(${mix(-4, 0, k) + Math.sin(t * 1.3) * 0.6}deg)` }}>
      <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 54, overflow: "hidden", background: "#fff" }}>
        <Img src={src(lead, "mobile.png")} style={{ position: "absolute", top: 54, width: "100%", display: "block", transform: `translateY(${-rola}px)` }} />
        <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 54, background: "rgba(255,255,255,.96)" }} />
        <div style={{ position: "absolute", left: "50%", top: 12, width: 130, height: 34, marginLeft: -65, borderRadius: 17, background: "#10151F", zIndex: 4 }} />
      </div>
      {/* camada sem recorte, sobre a tela: as peças vêm de fora do aparelho e pousam nela */}
      <div style={{ position: "absolute", left: 14, top: 14, right: 14, bottom: 14 }}>
        <IconesStatus />
        <Notificacao t1={30.7} />
      </div>
    </div>
  );
};

// pop-ups de vidro fosco sobre o celular depois que o HZK aponta: voam das bordas do quadro e pousam em volta do aparelho
const PopUps: React.FC = () => {
  const t = useT();
  const itens = [{ x: 40, y: 380, txt: "Indicação", ico: "★", dx: -520, dy: 60 }, { x: 560, y: 120, txt: "Interesse", ico: "●", dx: 380, dy: -360 },
    { x: 760, y: 560, txt: "Abrir o site", ico: "→", dx: 520, dy: 120 }];
  const sai = ent(t, 31.2, 0.3, VAIVEM);
  return (
    <>
      {itens.map((it, i) => (
        <Voa key={i} t0={POPUP_POUSO[i]} dx={it.dx} dy={it.dy} rot={i % 2 ? 14 : -14} style={{ left: it.x, top: it.y + Math.sin(t * 1.6 + i * 2) * 6 }}>
          <div style={{ padding: "14px 22px", borderRadius: 26, background: "rgba(27,36,50,.72)", backdropFilter: "blur(10px)", border: "1.5px solid rgba(245,245,242,.22)",
            boxShadow: "0 18px 40px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.12)", display: "flex", gap: 12, alignItems: "center", fontFamily: FONTE, fontWeight: 800, fontSize: 36,
            color: C.white, opacity: 1 - sai, transform: `scale(${1 - 0.3 * sai})` }}>
            <span style={{ width: 38, height: 38, borderRadius: 19, background: C.orange, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{it.ico}</span>{it.txt}
          </div>
        </Voa>
      ))}
    </>
  );
};

// "o caminho do jeito que essa pessoa vê": linha emaranhada (o caminho confuso) que se desenha, estica com aceleração
// forte no meio e assenta reta subindo da esquerda para a direita (motivo HZK), com um tremor elástico curto no fim.
const ESTICA = Easing.bezier(0.83, 0, 0.17, 1);
const LinhaCaminho: React.FC = () => {
  const t = useT();
  const desenho = ent(t, LINHA.desenha, 0.9, VAIVEM);
  const reta = ent(t, LINHA.estica, LINHA.reta - LINHA.estica, ESTICA);
  const tremor = t > LINHA.reta ? 0.09 * Math.sin((t - LINHA.reta) * 26) * Math.exp(-(t - LINHA.reta) * 7) : 0;
  const k = 1 - reta + tremor;  // 1 = emaranhada, 0 = reta
  const vis = ent(t, LINHA.desenha - 0.05, 0.2) * (1 - ent(t, 36.35, 0.3, VAIVEM));
  const pts: string[] = [];
  for (let i = 0; i <= 160; i++) {
    const u = i / 160;
    const x = 150 + 780 * u + 95 * Math.sin(2 * Math.PI * 5 * u) * k;
    const y = 990 - 130 * u + (85 * Math.cos(2 * Math.PI * 5 * u) + 40 * Math.sin(2 * Math.PI * 2 * u)) * k;
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  const fim = mola(t, LINHA.reta);
  return (
    <svg width="1080" height="1920" style={{ position: "absolute", left: 0, top: 0, opacity: vis }}>
      <polyline points={pts.join(" ")} fill="none" stroke={C.orange} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={`${desenho} 1`} />
      {[[150, 990], [930, 860]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={14 * fim} fill={C.orange} stroke={C.deep} strokeWidth={5} />)}
    </svg>
  );
};

const Convite: React.FC<{ lead: Lead }> = ({ lead }) => {
  const t = useT();
  // a lista sobe em "Separamos três pontos": é o momento em que o lead sente a análise feita para ele
  const lista = ent(t, 36.6, 0.6, VAIVEM);
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, transform: `translateY(${-lista * 160}px)` }}>
        {/* o título já vem montado na cena que sobe com o scroll (31,75 s); a voz lê "Por que não?" às 33 s */}
        <PorQueNao t0={31.0} y={420} />
        <div style={{ position: "absolute", top: 660, left: 90, right: 90 }}><Palavras texto="ver esse caminho do jeito que *essa pessoa vê?*" t0={33.7} tam={58} peso={700} passo={0.05} /></div>
      </div>
      <LinhaCaminho />
      {lead.pontos.map((p, i) => {
        const e = mola(t, 36.9 + i * 0.15);
        return (
          <div key={i} style={{ position: "absolute", left: 90, right: 90, top: 760 + i * 142, height: 120, borderRadius: 24, background: C.graphite, border: `2px solid ${C.line}`,
            borderLeft: `6px solid ${C.orange}`, display: "flex", alignItems: "center", gap: 24, padding: "0 30px",
            fontFamily: FONTE, opacity: Math.min(1, e * 1.5), transform: `translateX(${(1 - e) * 120}px)` }}>
            <span style={{ width: 62, height: 62, borderRadius: 31, background: C.orange, color: C.white, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 34, flex: "none",
              transform: `scale(${mix(0.5, 1, e)})` }}>{i + 1}</span>
            <span style={{ color: C.white, fontWeight: 800, fontSize: fonteQueCabe(p.short, 760, 40, 2, 28), lineHeight: 1.12 }}>{p.short}</span>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// Pausa da dica (Gabriel, 03/11, referências + adendo da "quarta parede"): a cena congela e borra; o HZK segura a borda
// direita do próprio vídeo e espia para dentro, acenando (entrada e saída animadas no 3D, placa parada aqui).
// "Pausa para a dica!" à esquerda; obturador + flash na palavra "print"; "Agora, vamos voltar pro vídeo!"; ele sai com
// antecipação e puxão para fora (48,15–48,5) e o blur some logo em seguida (Diagnostico > borra).
const Dica: React.FC = () => {
  const t = useT();
  const titulo = mola(t, 41.0) * (1 - ent(t, 46.2, 0.3, VAIVEM));
  const volta = mola(t, 46.45) * (1 - ent(t, 48.15, 0.2, VAIVEM));
  const flash = Math.max(0, 1 - Math.abs(t - OBTURADOR_DICA - 0.03) * 12) * 0.85;
  const selo = mola(t, OBTURADOR_DICA) * (1 - ent(t, 46.2, 0.3, VAIVEM));
  return (
    <AbsoluteFill>
      <Sequence from={Math.round(PLACA.dica[0] * tl.fps)} durationInFrames={Math.round((PLACA.dica[1] - PLACA.dica[0]) * tl.fps)} layout="none">
        <OffthreadVideo src={staticFile("dx/placa_dica.webm")} transparent muted style={{ position: "absolute", width: 1080, height: 1920 }} />
      </Sequence>
      <div style={{ position: "absolute", left: 64, width: 640, top: 250, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 30, fontFamily: FONTE }}>
        <div style={{ padding: "26px 38px", borderRadius: 32, background: C.graphite, border: `2px solid ${C.line}`, boxShadow: "0 40px 90px rgba(0,0,0,.45)", fontWeight: 900, fontSize: 96,
          color: C.white, letterSpacing: -2, lineHeight: 0.98, opacity: Math.min(1, titulo * 1.5), transformOrigin: "left center",
          transform: `rotate(${mix(-8, -3, titulo)}deg) scale(${mix(0.6, 1, titulo)})` }}>
          Pausa para<br />a <span style={{ color: C.orange }}>dica!</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "18px 26px", borderRadius: 26, background: C.orange, color: C.white, fontWeight: 800, fontSize: 40, lineHeight: 1.1,
          opacity: Math.min(1, selo * 1.5), transform: `scale(${mix(0.5, 1, selo)}) rotate(${mix(6, 0, selo)}deg)`, transformOrigin: "left center", boxShadow: "0 18px 40px rgba(234,91,37,.35)" }}>
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke={C.white} strokeWidth="2" strokeLinejoin="round" style={{ flex: "none" }}><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.6" /></svg>
          Tire um print de cada ponto
        </div>
      </div>
      <div style={{ position: "absolute", left: 64, top: 300, padding: "24px 36px", borderRadius: 30, background: C.graphite, border: `2px solid ${C.orange}`, fontFamily: FONTE, fontWeight: 900, fontSize: 70,
        lineHeight: 1, color: C.white, opacity: Math.min(1, volta * 1.5), transform: `translateX(${(1 - volta) * -80}px)` }}>
        De volta ao <span style={{ color: C.orange }}>vídeo ▶</span>
      </div>
      {flash > 0 && <AbsoluteFill style={{ background: C.white, opacity: flash }} />}
    </AbsoluteFill>
  );
};

// conteúdo da tela grande da análise (1600×1000): print com zoom e marcação; print de celular centralizado
const TELA_W = 1600, TELA_H = 1000;
const ConteudoAnalise: React.FC<{ lead: Lead; ponto: Ponto; t0: number; t1: number }> = ({ lead, ponto, t0, t1 }) => {
  const mobile = lead.dims[ponto.print].w < 1000;
  const vw = mobile ? Math.round(TELA_H * 0.46) : TELA_W;
  return (
    <div style={{ position: "absolute", inset: 0, background: mobile ? C.graphite : "#fff" }}>
      <div style={{ position: "absolute", left: (TELA_W - vw) / 2, top: 0, width: vw, height: TELA_H, overflow: "hidden", background: "#fff" }}>
        <VistaPrint lead={lead} ponto={ponto} t0={t0} t1={t1} vw={vw} vh={TELA_H} />
      </div>
    </div>
  );
};

const CartoesPonto: React.FC<{ ponto: Ponto; n: number; t0: number; t1: number }> = ({ ponto, n, t0, t1 }) => {
  const t = useT();
  const tit = mola(t, t0 + 0.3), texto = mola(t, t0 + 2.5), imp = mola(t, t0 + 6.2);
  const tamTexto = ponto.text.length > 150 ? 30 : ponto.text.length > 90 ? 34 : 38;
  const tamImp = ponto.impacto.length > 120 ? 30 : 36;
  const anel = ent(t, t0 + 0.3, 0.9);
  const flut = Math.sin((t - t0) * 1.4) * 4;  // os cartões nunca ficam parados
  return (
    <AbsoluteFill style={{ opacity: 1 - ent(t, t1 + 0.05, 0.1) }}>
      <div style={{ position: "absolute", left: 50, right: 50, top: 70, minHeight: 120, display: "flex", alignItems: "center", gap: 22, fontFamily: FONTE,
        opacity: Math.min(1, tit * 1.5), transform: `translateY(${(1 - tit) * 40}px)` }}>
        <span style={{ position: "relative", width: 74, height: 74, borderRadius: 37, background: C.orange, color: C.white, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 42, flex: "none",
          boxShadow: "0 12px 30px rgba(234,91,37,.35)", transform: `scale(${mix(0.4, 1, tit)})` }}>
          {n}
          <span style={{ position: "absolute", inset: -6, borderRadius: 43, border: `3px solid ${C.orange}`, opacity: 1 - anel, transform: `scale(${mix(1, 1.6, anel)})` }} />
        </span>
        <span style={{ color: C.white, fontWeight: 900, fontSize: fonteQueCabe(ponto.short, 860, 50, 2, 30), lineHeight: 1.08, WebkitTextStroke: `8px ${C.deep}`, paintOrder: "stroke fill" }}>{ponto.short}</span>
      </div>
      <div style={{ position: "absolute", left: 44, right: 44, top: 1380 + flut, fontFamily: FONTE }}>
        <div style={{ padding: "22px 28px", borderRadius: 22, background: "rgba(17,24,39,.92)", border: `2px solid ${C.line}`, borderTop: `4px solid ${C.orange}`, opacity: Math.min(1, texto * 1.5),
          transform: `translateY(${(1 - texto) * 40}px) scale(${mix(0.92, 1, texto)})`, color: C.white, fontWeight: 600, fontSize: tamTexto, lineHeight: 1.24 }}>
          <b style={{ color: C.orange }}>Um exemplo: </b>{ponto.text}.
        </div>
        <div style={{ marginTop: 16, padding: "18px 26px", borderRadius: 20, background: C.graphite, borderLeft: `6px solid ${C.orange}`, opacity: Math.min(1, imp * 1.5),
          transform: `translateX(${(1 - imp) * -60}px)`, color: C.mineral, fontWeight: 700, fontSize: tamImp, lineHeight: 1.22 }}>
          {ponto.impacto}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const IconeWhats: React.FC<{ tam: number; cor: string }> = ({ tam, cor }) => (
  <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke={cor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3.5 20.5l1.3-4.2A8.6 8.6 0 1 1 8 19.4z" />
    <path d="M9 8.6c0 3 2.6 6 5.8 6.4l1.1-1.3-1.8-1-1 .8c-1-.4-2.1-1.5-2.5-2.5l.8-1-1-1.8z" fill={cor} stroke="none" />
  </svg>
);

const Fechamento: React.FC<{ lead: Lead }> = ({ lead }) => {
  const t = useT();
  const [f0] = B.fecho;
  // tempos do roteiro de 114 s + S. d1 82,9 · d2 90,5 (os três nós entram em "o que você oferece / como deseja se
  // apresentar / o que precisa facilitar") · d3 100,4 · d4 103,9. As trocas acontecem sob as transições (TRANS).
  const a = t < 90.4 + S, b = t >= 90.4 + S && t < 100.3 + S, c = t >= 100.3 + S && t < 103.7 + S, d = t >= 103.7 + S;
  const hzk = fala("HZK.").t0;
  const n = [[120, 1240], [340, 960], [560, 680]];
  const itens = [{ t0: 93.4 + S, txt: "O que você oferece", x: 190, y: 1165, w: 820 }, { t0: 95.4 + S, txt: "Como deseja se apresentar", x: 410, y: 885, w: 600 },
    { t0: 97.1 + S, txt: "O que precisa facilitar para seus clientes", x: 630, y: 560, w: 400 }];
  const l1 = ent(t, 93.6 + S, 1.6, VAIVEM), l2 = ent(t, 95.6 + S, 1.4, VAIVEM);
  // cartela (v3.2, Gabriel: "carimbo"): o logo carimba primeiro, o WhatsApp 0,5 s depois; frase e motivo com a voz;
  // a tela congela no obturador final (Diagnostico > Freeze)
  const logo = carimbo(t, LOGO_FINAL), cta = carimbo(t, LOGO_FINAL + 0.5), frase = mola(t, hzk + 0.8), motivo = ent(t, hzk + 1.0, 1.0, VAIVEM);
  const brilho = 0.5 + 0.5 * Math.sin((t - LOGO_FINAL) * 1.7);
  const deriva = Math.sin(t * 0.6) * 6;
  const varre = ent(t, RISCO.varre, 0.38, Easing.in(Easing.cubic));  // a janela e a frase riscada saem varridas
  return (
    <AbsoluteFill>
      {a && (
        <AbsoluteFill>
          <div style={{ position: "absolute", left: 90, top: 200 + deriva, perspective: 1600, transform: `translate(${-1300 * varre}px, ${-120 * varre}px) rotate(${-8 * varre}deg)` }}>
            <div style={{ transform: `rotateY(${mix(-8, 4, ent(t, f0, 7, (x) => x))}deg)` }}>
              <JanelaSite url={lead.url} w={900} h={520}><Img src={src(lead, "home.png")} style={{ width: 900, display: "block" }} /></JanelaSite>
            </div>
          </div>
          <div style={{ position: "absolute", top: 830, left: 80, right: 80, transform: `translate(${1300 * varre}px, ${60 * varre}px) rotate(${6 * varre}deg)` }}>
            <Palavras texto="Não é sobre estar *errado.*" t0={83.2 + S} tam={74} />
            {/* risco de marcador sobre "errado.": diagonal subindo, traço grosso, desenhado rápido (v3.2) */}
            <svg width="920" height="120" style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
              <path d="M 622 92 Q 770 66 914 16" fill="none" stroke={C.orange} strokeWidth={17} strokeLinecap="round" pathLength={1}
                strokeDasharray={`${ent(t, RISCO.ini, 0.22, Easing.out(Easing.cubic))} 1`} />
            </svg>
          </div>
          <div style={{ position: "absolute", top: 900, left: 80, right: 80 }}><Palavras texto="É sobre representar o *nível da sua empresa.*" t0={RISCO.varre + 0.3} tam={60} peso={800} passo={0.05} /></div>
        </AbsoluteFill>
      )}
      {b && (
        <AbsoluteFill>
          <div style={{ position: "absolute", left: 60, top: 230, width: 620, fontFamily: FONTE, fontWeight: 900, fontSize: 62, lineHeight: 1.08, color: C.white,
            opacity: Math.min(1, mola(t, 90.5 + S) * 1.5), transform: `translateY(${(1 - mola(t, 90.5 + S)) * 40}px)` }}>
            Começa por entender o seu <span style={{ color: C.orange }}>negócio</span>.
          </div>
          <svg width="1080" height="1920" style={{ position: "absolute" }}>
            {l1 > 0 && <line x1={n[0][0]} y1={n[0][1]} x2={mix(n[0][0], n[1][0], l1)} y2={mix(n[0][1], n[1][1], l1)} stroke={C.orange} strokeWidth={6} strokeLinecap="round" />}
            {l2 > 0 && <line x1={n[1][0]} y1={n[1][1]} x2={mix(n[1][0], n[2][0], l2)} y2={mix(n[1][1], n[2][1], l2)} stroke={C.orange} strokeWidth={6} strokeLinecap="round" />}
            {n.map(([x, y], i) => t > itens[i].t0 && <circle key={i} cx={x} cy={y} r={24 * mola(t, itens[i].t0)} fill={C.orange} stroke={C.deep} strokeWidth={6} />)}
          </svg>
          {itens.map((it, i) => {
            const e = mola(t, it.t0);
            return <div key={i} style={{ position: "absolute", left: it.x, top: it.y + Math.sin(t * 1.2 + i) * 4, width: it.w, padding: "28px 34px", borderRadius: 26, background: C.graphite, border: `2px solid ${C.line}`,
              color: C.white, fontFamily: FONTE, fontWeight: 800, fontSize: 42, lineHeight: 1.14, opacity: Math.min(1, e * 1.5), transform: `translateY(${(1 - e) * 50}px) scale(${mix(0.85, 1, e)})` }}>{it.txt}</div>;
          })}
        </AbsoluteFill>
      )}
      {c && (
        <AbsoluteFill>
          <PorQueNao t0={100.4 + S} y={560} tam={132} />
          <div style={{ position: "absolute", top: 830, left: 80, right: 80 }}><Palavras texto="dar esse *próximo passo?*" t0={101.6 + S} tam={74} peso={700} /></div>
        </AbsoluteFill>
      )}
      {d && (
        <AbsoluteFill>
          <Img src={staticFile("dx/logo.png")} style={{ position: "absolute", left: 220, top: 470, width: 640, opacity: Math.min(1, logo * 3), transform: `scale(${mix(1.7, 1, logo)})` }} />
          <div style={{ position: "absolute", left: 90, right: 90, top: 640, textAlign: "center", fontFamily: FONTE, fontWeight: 500, fontSize: 40, color: C.mineral,
            opacity: Math.min(1, frase * 1.5), transform: `translateY(${(1 - frase) * 30}px)` }}>
            O digital a favor do que importa para você.
          </div>
          <svg width="1080" height="200" style={{ position: "absolute", top: 730 }}>
            <polyline points="400,150 540,100 680,50" fill="none" stroke={C.orange} strokeWidth={5} strokeLinecap="round" pathLength={1} strokeDasharray={`${motivo} 1`} />
            {[[400, 150], [540, 100], [680, 50]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={12 * mola(t, hzk + 1.0 + i * 0.3)} fill={C.orange} />)}
          </svg>
          <div style={{ position: "absolute", left: 90, right: 90, top: 1060, padding: "40px 30px", borderRadius: 34, background: C.orange, color: C.white, fontFamily: FONTE, fontWeight: 900, fontSize: 40,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 22, opacity: Math.min(1, cta * 3), transform: `scale(${mix(1.6, 1, cta) + 0.01 * brilho}) rotate(${mix(-4, 0, Math.min(1, cta))}deg)`,
            boxShadow: `0 26px ${70 + brilho * 30}px rgba(234,91,37,${0.28 + brilho * 0.14})` }}>
            <IconeWhats tam={58} cor={C.white} />Vamos conversar sobre o seu site.
          </div>
          <div style={{ position: "absolute", left: 90, right: 90, top: 1300, textAlign: "center", fontFamily: FONTE, fontWeight: 600, fontSize: 32, color: C.muted, opacity: ent(t, LOGO_FINAL + 0.9, 0.4) }}>
            É só responder esta mensagem.
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

export const Diagnostico: React.FC<{ lead: Lead }> = ({ lead }) => {
  const t = useT();
  const [h0] = B.hub, [r1] = [B.rua[1]], [p0, p1] = B.pontos, [k0, k1] = B.dica;
  // cortes secos sob as transições (TRANS): a cena que sai some no instante do corte, a que entra aparece nele
  const hub = ent(t, h0 + 0.2, 0.5, VAIVEM) * (t < 22.35 ? 1 : 0);
  const rua = t >= 22.35 && t < 31.75 ? 1 : 0;
  const pts = t >= p0 && t < p1 ? 1 : 0;
  const pontoAtual = tl.pontos.findIndex((s) => t >= s.ini && t < s.fim);
  const cel = ent(t, 28.3, 0.9, VAIVEM);
  const borra = ent(t, k0 + 0.1, 0.5, VAIVEM) * (1 - ent(t, SAIDA_DICA, 0.12));  // entra em 0,5 s com a espreitada; sai logo depois do HZK
  const cam = camera(t);
  const flash = Math.max(0, 1 - Math.abs(t - OBTURADOR_FINAL - 0.03) * 12) * 0.55;
  const urlVel = velDigita(lead);
  return (
    <AbsoluteFill style={{ background: C.deep }}>
      <svg width="0" height="0" style={{ position: "absolute" }}>
        <filter id="dx-borrao-movimento"><feGaussianBlur stdDeviation={`${cam.bx} ${cam.by}`} /></filter>
      </svg>
      {/* tudo que é cena fica dentro da câmera virtual (whip/scroll) e congela no obturador final */}
      <Freeze frame={Math.round((OBTURADOR_FINAL + 0.03) * tl.fps)} active={t >= OBTURADOR_FINAL + 0.03}>
        <AbsoluteFill style={{ transform: `translate(${cam.x}px, ${cam.y}px)`, filter: cam.bx + cam.by > 0.5 ? "url(#dx-borrao-movimento)" : undefined }}>
          <Fundo />
          {t >= h0 - 0.2 && t < 22.4 && (
            <Respira>
              <AbsoluteFill style={{ opacity: hub }}>
                <NaTela nome="home" t={t} w={1440} h={900}><Img src={src(lead, "home.png")} style={{ width: 1440, display: "block" }} /></NaTela>
                <NaTela nome="mobile" t={t} w={780} h={1688}><Img src={src(lead, "mobile.png")} style={{ width: 780, display: "block" }} /></NaTela>
              </AbsoluteFill>
              <Sequence from={Math.round(PLACA.hub[0] * tl.fps)} durationInFrames={Math.round((PLACA.hub[1] - PLACA.hub[0]) * tl.fps)} layout="none">
                <AbsoluteFill style={{ opacity: hub }}><OffthreadVideo src={staticFile("dx/placa_hub.webm")} transparent muted style={{ width: 1080, height: 1920 }} /></AbsoluteFill>
              </Sequence>
            </Respira>
          )}
          <Sequence from={Math.round(PLACA.rua[0] * tl.fps)} durationInFrames={Math.round((PLACA.rua[1] - PLACA.rua[0]) * tl.fps)} layout="none">
            {/* o fundo borra e escurece conforme o celular se aproxima (0 → 12 px) */}
            <AbsoluteFill style={{ opacity: rua, filter: `blur(${12 * cel}px) brightness(${1 - 0.3 * cel})`, transform: `scale(${1 + 0.04 * cel})` }}>
              <OffthreadVideo src={staticFile("dx/placa_rua.mp4")} muted style={{ width: 1080, height: 1920 }} />
            </AbsoluteFill>
          </Sequence>
          {t >= 28 && t < r1 + 0.3 && (
            <AbsoluteFill style={{ opacity: rua }}>
              <Celular lead={lead} k={mola(t, 28.3)} />
              <PopUps />
            </AbsoluteFill>
          )}
          {t >= 31.75 && t < k1 && (
            <AbsoluteFill style={{ filter: borra > 0 ? `blur(${16 * borra}px) brightness(${1 - 0.4 * borra})` : undefined, transform: `scale(${1 - 0.05 * borra})` }}>
              <Freeze frame={Math.round((k0 - 0.05) * tl.fps)} active={t >= k0 - 0.05}><Convite lead={lead} /></Freeze>
            </AbsoluteFill>
          )}
          {t >= k0 && t < k1 && <Dica />}
          {pts > 0 && pontoAtual >= 0 && (
            <Respira>
              <NaTela nome="analise" t={t} w={TELA_W} h={TELA_H}>
                <ConteudoAnalise lead={lead} ponto={lead.pontos[pontoAtual]} t0={tl.pontos[pontoAtual].ini} t1={tl.pontos[pontoAtual].fim} />
              </NaTela>
              <Sequence from={Math.round(PLACA.ponto[0] * tl.fps)} durationInFrames={Math.round((PLACA.ponto[1] - PLACA.ponto[0]) * tl.fps)} layout="none">
                <OffthreadVideo src={staticFile("dx/placa_ponto.webm")} transparent muted style={{ position: "absolute", width: 1080, height: 1920 }} />
              </Sequence>
            </Respira>
          )}
          {pontoAtual >= 0 && t < p1 && <CartoesPonto ponto={lead.pontos[pontoAtual]} n={pontoAtual + 1} t0={tl.pontos[pontoAtual].ini} t1={tl.pontos[pontoAtual].fim} />}
          <Poeira k={janela(t, p0, B.fecho[1], 0.6) * 0.8 + janela(t, h0, 22.2, 0.5) * 0.5} />
          {t < h0 + 0.8 && <Gancho lead={lead} />}
          {t >= B.fecho[0] && <Fechamento lead={lead} />}
        </AbsoluteFill>
        <Cortina />
        <LegendaV3 />
      </Freeze>
      {flash > 0 && <AbsoluteFill style={{ background: C.white, opacity: flash }} />}
      <FaixaTeste lead={lead} />
      {SONS.map(([a, ts, v], i) => <Sequence key={i} from={Math.round(ts * tl.fps)} layout="none"><Audio src={staticFile(`dx/sfx/${a}.mp3`)} volume={v} /></Sequence>)}
      {/* uma tecla por caractere, no mesmo instante em que ele aparece na barra (Gancho > digitado) */}
      {lead.url.split("").map((_, i) => (
        <Sequence key={`k${i}`} from={Math.ceil((DIGITA + (i + 1) / urlVel) * tl.fps)} durationInFrames={6} layout="none">
          <Audio src={staticFile(`dx/sfx/tecla${(i * 3) % 5}.mp3`)} volume={0.32 + 0.06 * ((i * 7) % 3)} />
        </Sequence>
      ))}
      {[lead.cidade, lead.especialidade, lead.diferencial].filter(Boolean).map((_, i) => (
        <Sequence key={`c${i}`} from={Math.round((5.95 + i * 0.15) * tl.fps)} layout="none"><Audio src={staticFile(`dx/sfx/${i % 2 ? "pop2" : "pop"}.mp3`)} volume={0.28} /></Sequence>
      ))}
      {/* ambientes em blocos encadeados do tamanho do arquivo, não com `loop`: no loop o Remotion reinicia o quadro do
          volume a cada volta e o ducking lia o tempo errado (v2.1). Volume no tempo global, ducking com rampa de 0,3 s. */}
      {AMBIENTES.map(([a, t0, t1, v, fundo, dur], i) => {
        const ini = Math.round(t0 * tl.fps), fim = Math.round(t1 * tl.fps), passo = Math.round(dur * tl.fps);
        const blocos: number[] = [];
        for (let q = ini; q < fim; q += passo) blocos.push(q);
        return blocos.map((q) => (
          <Sequence key={`${a}-${i}-${q}`} from={q} durationInFrames={Math.min(passo, fim - q)} layout="none">
            <Audio src={staticFile(`dx/sfx/${a}`)}
              volume={(f) => { const g = q + f; return v * Math.min(1, (g - ini) / 18, (fim - g) / 24) * (1 - fundo * sobVoz(g / tl.fps)); }} />
          </Sequence>
        ));
      })}
      {tl.falas.map((f) => <Sequence key={f.id} from={Math.round(f.ini * tl.fps)} layout="none"><Audio src={staticFile(`dx/${f.arquivo}`)} /></Sequence>)}
    </AbsoluteFill>
  );
};
