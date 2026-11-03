// DX-001 — contrato do lead e peças que dependem dele. Nada de um lead específico fica escrito aqui.
import React from "react";
import { Img, staticFile } from "remotion";
import tl from "../../public/dx/timeline.json";
import { C, FONTE, VAIVEM, ent, mix, useT } from "../com001/base";

export type Ponto = {
  kind?: string; text: string; short: string; impacto: string; print: string;
  foco: [number, number, number, number] | null;
};
export type Lead = {
  pasta: string; // relativa a public/
  dims: Record<string, { w: number; h: number }>;
  empresa: string; url: string; pontos: Ponto[];
  cidade?: string; segmento?: string; especialidade?: string; diferencial?: string; cor?: string; teste?: boolean;
};
export const src = (l: Lead, arq: string) => staticFile(`${l.pasta}/${arq}`);

// Reduz a fonte até o texto caber em `linhas`, por estimativa determinística (nada de medir o DOM entre quadros).
export const fonteQueCabe = (texto: string, largura: number, maximo: number, linhas = 2, minimo = 26) =>
  Math.round(Math.max(minimo, Math.min(maximo, (largura * linhas) / (Math.max(1, texto.length) * 0.56))));

export const LegendaDx: React.FC = () => {
  const t = useT();
  const atual = tl.legendas.find((l) => t >= l.t0 - 0.04 && t < l.t1 + 0.12);
  if (!atual) return null;
  const k = ent(t, atual.t0 - 0.04, 0.16);
  return (
    <div style={{ position: "absolute", left: 60, right: 60, top: 1420, textAlign: "center", fontFamily: FONTE, fontWeight: 800, fontSize: 52, lineHeight: 1.12,
      color: C.white, WebkitTextStroke: `11px ${C.deep}`, paintOrder: "stroke fill", opacity: k, transform: `translateY(${(1 - k) * 10}px)` }}>
      {atual.texto.split(/(\*[^*]+\*)/).map((p, i) =>
        p.startsWith("*") ? <span key={i} style={{ color: C.orange }}>{p.slice(1, -1)}</span> : <span key={i}>{p}</span>)}
    </div>
  );
};

export const FaixaTeste: React.FC<{ lead: Lead }> = ({ lead }) => lead.teste ? (
  <div style={{ position: "absolute", top: 0, left: 0, right: 0, padding: "12px 0", textAlign: "center", background: "#FFD23F", color: "#111",
    fontFamily: FONTE, fontWeight: 800, fontSize: 26, letterSpacing: 1, zIndex: 9 }}>VÍDEO DE TESTE · SITE E DADOS FICTÍCIOS</div>
) : null;

export const JanelaSite: React.FC<{ url: string; w: number; h: number; style?: React.CSSProperties; children: React.ReactNode }> = ({ url, w, h, style, children }) => (
  <div style={{ width: w, height: h, borderRadius: 24, overflow: "hidden", position: "relative", background: C.graphite, border: `2px solid ${C.line}`,
    boxShadow: "0 44px 100px rgba(0,0,0,.5)", ...style }}>
    <div style={{ height: 52, display: "flex", alignItems: "center", gap: 10, padding: "0 22px", background: C.deep }}>
      {[0, 1, 2].map((i) => <span key={i} style={{ width: 13, height: 13, borderRadius: 7, background: C.line }} />)}
      <span style={{ marginLeft: 14, flex: 1, height: 30, borderRadius: 15, background: C.line, color: C.muted, fontFamily: FONTE, fontSize: 19, fontWeight: 600,
        lineHeight: "30px", padding: "0 18px", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{url}</span>
    </div>
    <div style={{ position: "relative", width: "100%", height: h - 52, overflow: "hidden", background: "#fff" }}>{children}</div>
  </div>
);

// Print com enquadramento calculado do `foco`. A marcação é posta em coordenadas de tela a partir da mesma conta da imagem,
// então acompanha o elemento em qualquer proporção. Sem foco: print inteiro; se for comprido, percorre de cima a baixo.
export const VistaPrint: React.FC<{ lead: Lead; ponto: Ponto; t0: number; t1: number; vw: number; vh: number }> = ({ lead, ponto, t0, t1, vw, vh }) => {
  const t = useT();
  const { w: W, h: H } = lead.dims[ponto.print];
  const larg = vw / W;
  const cobre = (s: number, tam: number, janela: number, p: number) => (tam * s <= janela ? (janela - tam * s) / 2 : Math.min(0, Math.max(janela - tam * s, p)));
  let s: number, tx: number, ty: number, marca: null | { x: number; y: number; w: number; h: number } = null;
  if (ponto.foco) {
    const [fx, fy, fw, fh] = ponto.foco;
    const sAlvo = Math.max(Math.min(vw / W, vh / H), Math.min(vw / (fw * 1.14), vh / (fh * 1.3), larg * 2.1));
    const k = ent(t, t0 + 0.7, 1.7, VAIVEM);
    s = mix(larg, sAlvo, k);
    const cx = fx + fw / 2, cy = fy + fh / 2;
    tx = cobre(s, W, vw, vw / 2 - cx * mix(larg, sAlvo, k));
    ty = cobre(s, H, vh, mix(0, vh / 2 - cy * sAlvo, k));
    marca = { x: fx * s + tx, y: fy * s + ty, w: fw * s, h: fh * s };
  } else {
    s = larg;
    tx = 0;
    const percurso = Math.max(0, H * s - vh);
    ty = H * s <= vh ? (vh - H * s) / 2 : -percurso * ent(t, t0 + 1, t1 - t0 - 2.2, (x) => x);
  }
  const m = ent(t, t0 + 2.2, 0.6);
  return (
    <>
      <Img src={src(lead, ponto.print)} style={{ position: "absolute", left: tx, top: ty, width: W * s, height: H * s, maxWidth: "none" }} />
      {marca && (
        <>
          {/* escurece o resto do print e o contorno laranja se desenha em volta do trecho; depois pulsa de leve (v2) */}
          <div style={{ position: "absolute", left: marca.x - 9, top: marca.y - 9, width: marca.w + 18, height: marca.h + 18, borderRadius: 14,
            boxShadow: `0 0 0 3000px rgba(17,24,39,${0.46 * m})` }} />
          <svg width={vw} height={vh} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
            <rect x={marca.x - 9} y={marca.y - 9} width={marca.w + 18} height={marca.h + 18} rx={14} fill="none" stroke={C.deep} strokeWidth={10}
              pathLength={1} strokeDasharray={`${ent(t, t0 + 2.2, 1.1, VAIVEM)} 1`} opacity={0.75} />
            <rect x={marca.x - 9} y={marca.y - 9} width={marca.w + 18} height={marca.h + 18} rx={14} fill="none" stroke={C.orange}
              strokeWidth={5 + 1.5 * Math.max(0, Math.sin((t - t0 - 3.4) * 3)) * ent(t, t0 + 3.4, 0.3)}
              pathLength={1} strokeDasharray={`${ent(t, t0 + 2.2, 1.1, VAIVEM)} 1`} strokeLinecap="round" />
          </svg>
        </>
      )}
    </>
  );
};

// Homografia dos quatro cantos exportados do Blender para o CSS: o print encaixa na tela 3D em perspectiva exata.
export const matrizTela = (w: number, h: number, q: number[]) => {
  const dst = [[q[6], q[7]], [q[4], q[5]], [q[2], q[3]], [q[0], q[1]]]; // sup-esq, sup-dir, inf-dir, inf-esq
  const srcP = [[0, 0], [w, 0], [w, h], [0, h]];
  const a: number[][] = [];
  srcP.forEach(([x, y], i) => {
    const [u, v] = dst[i];
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  });
  for (let i = 0; i < 8; i++) {
    let p = i;
    for (let r = i + 1; r < 8; r++) if (Math.abs(a[r][i]) > Math.abs(a[p][i])) p = r;
    [a[i], a[p]] = [a[p], a[i]];
    for (let r = 0; r < 8; r++) {
      if (r === i) continue;
      const f = a[r][i] / a[i][i];
      for (let c = i; c < 9; c++) a[r][c] -= f * a[i][c];
    }
  }
  const [m0, m1, m2, m3, m4, m5, m6, m7] = a.map((l, i) => l[8] / l[i]);
  return `matrix3d(${m0},${m3},0,${m6},${m1},${m4},0,${m7},0,0,1,0,${m2},${m5},0,1)`;
};
