// COM-001 — peças comuns: tokens HZK, curvas, fundo, títulos, navegador e legenda. Tempo sempre em segundos globais.
import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import tl from "../../public/com001/timeline.json";

export const C = {
  graphite: "#1B2432", deep: "#111827", line: "#2A3242", orange: "#EA5B25", gray: "#535353",
  mineral: "#F5F5F2", white: "#FFFFFF", muted: "#A3AAB8",
};
export const FONTE = "'Segoe UI', sans-serif";
export const SUAVE = Easing.bezier(0.16, 1, 0.3, 1);
export const VAIVEM = Easing.bezier(0.65, 0, 0.35, 1);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export const useT = () => useCurrentFrame() / tl.fps;
export const ent = (t: number, t0: number, d = 0.7, e = SUAVE) =>
  interpolate(t, [t0, t0 + d], [0, 1], { ...clamp, easing: e });
export const janela = (t: number, a: number, b: number, d = 0.4) => ent(t, a, d) * (1 - ent(t, b - d, d, VAIVEM));
export const mix = (a: number, b: number, k: number) => a + (b - a) * k;

export const Fundo: React.FC<{ claro?: number }> = ({ claro = 0 }) => {
  const t = useT();
  return (
    <AbsoluteFill style={{ background: `radial-gradient(120% 70% at 50% 34%, ${C.graphite} 0%, ${C.deep} 72%)` }}>
      <svg width="1080" height="1920" style={{ position: "absolute", opacity: 0.55 + claro }}>
        {[300, 470, 660, 880].map((r, i) => (
          <circle key={r} cx={540} cy={760} r={r} fill="none" stroke={C.line} strokeWidth={2}
            strokeDasharray="1 18" strokeLinecap="round"
            transform={`rotate(${(i % 2 ? -1 : 1) * t * (3 + i)} 540 760)`} />
        ))}
      </svg>
    </AbsoluteFill>
  );
};

// "*palavra*" recebe o destaque laranja; as palavras sobem em sequência.
export const Palavras: React.FC<{ texto: string; t0: number; tam: number; peso?: number; cor?: string; passo?: number }> = ({
  texto, t0, tam, peso = 900, cor = C.white, passo = 0.07,
}) => {
  const t = useT();
  return (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: `0 ${tam * 0.27}px`, fontFamily: FONTE,
      fontWeight: peso, fontSize: tam, lineHeight: 1.1, letterSpacing: -tam * 0.012 }}>
      {texto.split(" ").map((p, i) => {
        const hot = p.startsWith("*");
        const k = ent(t, t0 + i * passo, 0.75);
        return (
          <span key={i} style={{ overflow: "hidden", display: "inline-block", paddingBottom: tam * 0.14 }}>
            <span style={{ display: "inline-block", color: hot ? C.orange : cor, opacity: k,
              transform: `translateY(${(1 - k) * tam * 0.95}px)` }}>{p.replace(/\*/g, "")}</span>
          </span>
        );
      })}
    </div>
  );
};

// Título de destaque (D19): placa grafite opaca, fonte Black, palavra-chave laranja com sublinhado que se desenha.
export const PorQueNao: React.FC<{ t0: number; y: number; tam?: number }> = ({ t0, y, tam = 124 }) => {
  const t = useT();
  const k = ent(t, t0, 0.8);
  const sub = ent(t, t0 + 0.55, 0.6, VAIVEM);
  return (
    <div style={{ position: "absolute", top: y, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
      <div style={{ background: C.graphite, border: `2px solid ${C.line}`, borderRadius: 36, padding: "34px 58px 42px",
        opacity: k, transform: `translateY(${(1 - k) * 46}px) scale(${mix(0.94, 1, k)})`,
        boxShadow: "0 40px 90px rgba(0,0,0,.45)", fontFamily: FONTE, fontWeight: 900, fontSize: tam, color: C.white,
        letterSpacing: -2, whiteSpace: "nowrap" }}>
        Por que{" "}
        <span style={{ color: C.orange, position: "relative", display: "inline-block" }}>
          não?
          <span style={{ position: "absolute", left: 4, right: 4, bottom: -8, height: 9, borderRadius: 5, background: C.orange,
            transformOrigin: "left", transform: `scaleX(${sub})` }} />
        </span>
      </div>
    </div>
  );
};

export const Navegador: React.FC<{ w: number; h: number; style?: React.CSSProperties; escuro?: boolean; children?: React.ReactNode }> = ({
  w, h, style, escuro, children,
}) => (
  <div style={{ width: w, height: h, borderRadius: 26, overflow: "hidden", position: "relative",
    background: escuro ? C.graphite : C.mineral, border: `2px solid ${escuro ? C.line : "#D9DBD8"}`,
    boxShadow: "0 44px 100px rgba(0,0,0,.42)", ...style }}>
    <div style={{ height: 54, display: "flex", alignItems: "center", gap: 11, padding: "0 24px",
      background: escuro ? C.deep : "#E6E7E3" }}>
      {[0, 1, 2].map((i) => <span key={i} style={{ width: 14, height: 14, borderRadius: 7, background: escuro ? C.line : "#BFC3C2" }} />)}
      <span style={{ marginLeft: 20, flex: 1, height: 24, borderRadius: 12, background: escuro ? C.line : "#D3D5D1" }} />
    </div>
    {children}
  </div>
);

export const Previa: React.FC<{ qual: "aurora" | "vertice"; w: number; style?: React.CSSProperties }> = ({ qual, w, style }) => (
  <div style={{ width: w, ...style }}>
    <Img src={staticFile(`com001/${qual}-tela.png`)} style={{ width: w, display: "block", borderRadius: 18,
      boxShadow: "0 46px 110px rgba(0,0,0,.5)" }} />
  </div>
);

export const SeloDemo: React.FC<{ style?: React.CSSProperties }> = ({ style }) => (
  <div style={{ fontFamily: FONTE, fontWeight: 600, fontSize: 25, letterSpacing: 1, color: C.muted, ...style }}>
    Prévia ilustrativa
  </div>
);

export const Legenda: React.FC = () => {
  const t = useT();
  const atual = tl.legendas.find((l) => t >= l.t0 - 0.04 && t < l.t1 + 0.12);
  if (!atual) return null;
  const k = ent(t, atual.t0 - 0.04, 0.16);
  return (
    <div style={{ position: "absolute", left: 60, right: 60, top: 1385, textAlign: "center", fontFamily: FONTE, fontWeight: 800,
      fontSize: 56, lineHeight: 1.12, color: C.white, WebkitTextStroke: `11px ${C.deep}`, paintOrder: "stroke fill",
      opacity: k, transform: `translateY(${(1 - k) * 10}px)` }}>
      {atual.texto.split(/(\*[^*]+\*)/).map((p, i) =>
        p.startsWith("*") ? <span key={i} style={{ color: C.orange }}>{p.slice(1, -1)}</span> : <span key={i}>{p}</span>)}
    </div>
  );
};
