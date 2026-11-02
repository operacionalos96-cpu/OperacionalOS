// DX-001 — modelo do vídeo de diagnóstico. Estrutura fixa + dados do lead vindos só das props.
import React from "react";
import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, staticFile } from "remotion";
import cantos from "../../public/dx/cantos.json";
import tl from "../../public/dx/timeline.json";
import { C, FONTE, Fundo, Palavras, PorQueNao, VAIVEM, ent, janela, mix, useT } from "../com001/base";
import { FaixaTeste, JanelaSite, Lead, LegendaDx, Ponto, VistaPrint, fonteQueCabe, matrizTela, src } from "./base";

export const DX = { fps: tl.fps, quadros: tl.quadros };
const INI_HUB = 11.2, FIM_HUB = 22.4, INI_RUA = 22.0, FIM_RUA = 33.6;

const SONS: [string, number, number][] = [
  ...[7.0, 11.1, 21.6, 33.0, 40.3, 54.3, 68.3, 82.5, 90.3, 100.2, 103.6].map((t): [string, number, number] => ["passagem", t, 0.5]),
  ...[3.3, 37.2, 37.8, 38.4, 43.0, 47.6, 57.0, 61.6, 71.0, 75.6, 92.6, 94.2, 95.9].map((t): [string, number, number] => ["toque", t, 0.4]),
  ["passos", 11.5, 0.45], ["passos", 22.0, 0.45], ["mensagem", 24.4, 0.5], ["carro", 26.4, 0.4], ["marca", 108.3, 0.7],
];
const AMBIENTES: [string, number, number, number][] = [["hub_ganho", 11.2, 22.4, 0.55], ["rua", 21.9, 33.6, 0.32], ["hub_ganho", 40.2, 70.2, 0.55], ["hub_ganho", 70.0, 82.8, 0.55]];

const Dados: React.FC<{ lead: Lead; k: number; top: number }> = ({ lead, k, top }) => {
  const extras = [lead.cidade, lead.especialidade, lead.diferencial].filter(Boolean) as string[];
  const tam = fonteQueCabe(lead.empresa, 920, 72, 2, 34);
  return (
    <div style={{ position: "absolute", left: 80, right: 80, top, opacity: k, transform: `translateY(${(1 - k) * 34}px)`, fontFamily: FONTE }}>
      {lead.cor && <div style={{ width: 90, height: 7, borderRadius: 4, background: lead.cor, border: `1px solid ${C.mineral}`, marginBottom: 18 }} />}
      <div style={{ color: C.white, fontWeight: 900, fontSize: tam, lineHeight: 1.1, letterSpacing: -0.5 }}>{lead.empresa}</div>
      {extras.length > 0 && <div style={{ color: C.muted, fontWeight: 600, fontSize: 32, marginTop: 14, lineHeight: 1.3 }}>{extras.join(" · ")}</div>}
    </div>
  );
};

const Abertura: React.FC<{ lead: Lead }> = ({ lead }) => {
  const t = useT();
  const sobe = ent(t, 2.3, 1.0, VAIVEM);
  const busca = janela(t, 2.7, 7.3, 0.7);
  const digitado = lead.url.slice(0, Math.max(0, Math.floor((t - 3.2) * 22)));
  const site = ent(t, 7.0, 1.2);
  const deriva = Math.sin(t * 0.7) * 5;
  const urlTam = fonteQueCabe(lead.url, 720, 44, 1, 24);
  return (
    <AbsoluteFill style={{ opacity: 1 - ent(t, 11.0, 0.6, VAIVEM) }}>
      <div style={{ position: "absolute", top: mix(620, 300, sobe), left: 70, right: 70, transform: `scale(${mix(1, 0.78, sobe)})`, opacity: 1 - ent(t, 6.9, 0.5) }}>
        <Palavras texto="Seu negócio" t0={0.6} tam={138} />
        <Palavras texto="tem *valor.*" t0={0.85} tam={138} />
      </div>
      <div style={{ position: "absolute", top: 720, left: 90, width: 900, height: 108, borderRadius: 54, background: C.mineral, display: "flex", alignItems: "center", gap: 24, padding: "0 42px",
        fontFamily: FONTE, fontSize: urlTam, fontWeight: 600, color: C.graphite, opacity: busca, transform: `translateY(${(1 - busca) * 46}px)`, boxShadow: "0 30px 80px rgba(0,0,0,.45)", overflow: "hidden", whiteSpace: "nowrap" }}>
        <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke={C.gray} strokeWidth="2.4" strokeLinecap="round" style={{ flex: "none" }}><circle cx="10.5" cy="10.5" r="7" /><path d="M16 16l5.5 5.5" /></svg>
        <span>{digitado}</span>
      </div>
      <div style={{ position: "absolute", left: 70, top: 200 + deriva, perspective: 1600, opacity: site }}>
        <div style={{ transform: `rotateX(${mix(14, 3, site)}deg) translateY(${(1 - site) * 90}px)` }}>
          <JanelaSite url={lead.url} w={940} h={640}><Img src={src(lead, "home.png")} style={{ width: 940, display: "block" }} /></JanelaSite>
        </div>
      </div>
      <Dados lead={lead} k={ent(t, 7.7, 0.9)} top={920} />
    </AbsoluteFill>
  );
};

const TelaPrint: React.FC<{ lead: Lead; arq: string; nome: "home" | "mobile"; t: number }> = ({ lead, arq, nome, t }) => {
  const f = Math.max(0, Math.min(cantos[nome].length - 1, Math.round((t - INI_HUB) * tl.fps)));
  const w = nome === "home" ? 1440 : 780, h = nome === "home" ? 900 : 1688;
  return <Img src={src(lead, arq)} style={{ position: "absolute", left: 0, top: 0, width: w, height: h, maxWidth: "none", objectFit: "cover", objectPosition: "top", transformOrigin: "0 0", transform: matrizTela(w, h, cantos[nome][f]) }} />;
};

const Celular: React.FC<{ lead: Lead; k: number }> = ({ lead, k }) => (
  <div style={{ position: "absolute", left: 300, top: 170, width: 480, height: 1020, borderRadius: 66, background: "#10151F", padding: 14, boxShadow: "0 50px 120px rgba(0,0,0,.45), inset 0 0 0 3px #3B4252",
    opacity: k, transform: `translateY(${(1 - k) * 160}px) scale(${mix(0.9, 1, k)})` }}>
    <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 54, overflow: "hidden", background: "#fff" }}>
      <Img src={src(lead, "mobile.png")} style={{ width: "100%", display: "block" }} />
    </div>
  </div>
);

const Convite: React.FC<{ lead: Lead }> = ({ lead }) => {
  const t = useT();
  const k = janela(t, 33.2, 40.6, 0.5);
  const lista = ent(t, 36.9, 0.6);
  return (
    <AbsoluteFill style={{ opacity: k }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, transform: `translateY(${-lista * 160}px)` }}>
        <PorQueNao t0={33.1} y={420} />
        <div style={{ position: "absolute", top: 660, left: 90, right: 90 }}><Palavras texto="ver esse caminho do jeito que *essa pessoa vê?*" t0={34.4} tam={58} peso={700} passo={0.05} /></div>
      </div>
      {lead.pontos.map((p, i) => {
        const e = ent(t, 37.2 + i * 0.6, 0.7);
        return (
          <div key={i} style={{ position: "absolute", left: 90, right: 90, top: 760 + i * 142, height: 120, borderRadius: 24, background: C.graphite, border: `2px solid ${C.line}`, display: "flex", alignItems: "center", gap: 24, padding: "0 30px",
            fontFamily: FONTE, opacity: e, transform: `translateY(${(1 - e) * 34}px)` }}>
            <span style={{ width: 62, height: 62, borderRadius: 31, background: C.orange, color: C.white, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 34, flex: "none" }}>{i + 1}</span>
            <span style={{ color: C.white, fontWeight: 800, fontSize: fonteQueCabe(p.short, 760, 40, 2, 28), lineHeight: 1.12 }}>{p.short}</span>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

const PontoCena: React.FC<{ lead: Lead; ponto: Ponto; n: number; t0: number; t1: number }> = ({ lead, ponto, n, t0, t1 }) => {
  const t = useT();
  const k = janela(t, t0, t1, 0.45);
  const mobile = lead.dims[ponto.print].w < 1000;
  const vw = mobile ? 400 : 960, vh = 588;
  const texto = ent(t, t0 + 2.6, 0.7), imp = ent(t, t0 + 7.2, 0.7);
  const tamTexto = ponto.text.length > 150 ? 32 : 38, tamImp = ponto.impacto.length > 120 ? 32 : 38;
  return (
    <AbsoluteFill style={{ opacity: k, transform: `translateY(${(1 - k) * 26}px)` }}>
      <div style={{ position: "absolute", left: 60, right: 60, top: 78, height: 120, display: "flex", alignItems: "center", gap: 22, fontFamily: FONTE }}>
        <span style={{ width: 70, height: 70, borderRadius: 35, background: C.orange, color: C.white, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 40, flex: "none" }}>{n}</span>
        <span style={{ color: C.white, fontWeight: 900, fontSize: fonteQueCabe(ponto.short, 840, 48, 2, 30), lineHeight: 1.08 }}>{ponto.short}</span>
      </div>
      <div style={{ position: "absolute", top: 212, left: (1080 - vw) / 2 }}>
        <JanelaSite url={lead.url} w={vw} h={vh + 52}><VistaPrint lead={lead} ponto={ponto} t0={t0} t1={t1} vw={vw} vh={vh} /></JanelaSite>
      </div>
      <div style={{ position: "absolute", left: 60, right: 60, top: 880, fontFamily: FONTE }}>
        <div style={{ opacity: texto, transform: `translateY(${(1 - texto) * 22}px)`, color: C.white, fontWeight: 600, fontSize: tamTexto, lineHeight: 1.24 }}>
          <b style={{ color: C.orange }}>Um exemplo: </b>{ponto.text}.
        </div>
        <div style={{ marginTop: 22, padding: "20px 26px", borderRadius: 20, background: C.graphite, borderLeft: `6px solid ${C.orange}`, opacity: imp, transform: `translateY(${(1 - imp) * 22}px)`, color: C.mineral, fontWeight: 700, fontSize: tamImp, lineHeight: 1.22 }}>
          {ponto.impacto}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Fechamento: React.FC<{ lead: Lead }> = ({ lead }) => {
  const t = useT();
  const a = janela(t, 82.7, 90.5, 0.5);
  const b = janela(t, 90.3, 100.4, 0.5);
  const c = janela(t, 100.2, 103.9, 0.4);
  const d = ent(t, 103.7, 0.6);
  const n = [[100, 1160], [320, 830], [540, 500]];
  const l1 = ent(t, 92.9, 1.4, VAIVEM), l2 = ent(t, 94.5, 1.4, VAIVEM);
  const itens = [{ t0: 92.6, txt: "O que você oferece", x: 170, y: 1085, w: 840 }, { t0: 94.2, txt: "Como deseja se apresentar", x: 390, y: 745, w: 620 }, { t0: 95.9, txt: "O que precisa facilitar para seus clientes", x: 610, y: 400, w: 410 }];
  const logo = ent(t, 108.2, 1.0), frase = ent(t, 109.0, 0.9), cta = ent(t, 104.0, 0.9), brilho = 0.5 + 0.5 * Math.sin((t - 104) * 1.7);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ opacity: a }}>
        <div style={{ position: "absolute", left: 90, top: 220, opacity: 0.9 }}><JanelaSite url={lead.url} w={900} h={470}><Img src={src(lead, "home.png")} style={{ width: 900, display: "block" }} /></JanelaSite></div>
        <div style={{ position: "absolute", top: 790, left: 80, right: 80 }}><Palavras texto="Onde o seu site pode representar melhor o *nível da sua empresa.*" t0={85.8} tam={68} /></div>
      </AbsoluteFill>
      {t > 90 && t < 100.8 && (
        <AbsoluteFill style={{ opacity: b }}>
          <Img src={staticFile("dx/logo.png")} style={{ position: "absolute", left: 60, top: 190, width: 400, opacity: ent(t, 90.5, 0.8) }} />
          <div style={{ position: "absolute", left: 60, top: 300, width: 500, fontFamily: FONTE, fontWeight: 900, fontSize: 56, lineHeight: 1.1, color: C.white, opacity: ent(t, 90.7, 0.7), transform: `translateY(${(1 - ent(t, 90.7, 0.7)) * 24}px)` }}>
            Começa por entender o seu <span style={{ color: C.orange }}>negócio</span>.
          </div>
          <svg width="1080" height="1920" style={{ position: "absolute" }}>
            {l1 > 0 && <line x1={n[0][0]} y1={n[0][1]} x2={mix(n[0][0], n[1][0], l1)} y2={mix(n[0][1], n[1][1], l1)} stroke={C.orange} strokeWidth={6} strokeLinecap="round" />}
            {l2 > 0 && <line x1={n[1][0]} y1={n[1][1]} x2={mix(n[1][0], n[2][0], l2)} y2={mix(n[1][1], n[2][1], l2)} stroke={C.orange} strokeWidth={6} strokeLinecap="round" />}
            {n.map(([x, y], i) => ent(t, itens[i].t0, 0.6) > 0 && <circle key={i} cx={x} cy={y} r={24 * ent(t, itens[i].t0, 0.6)} fill={C.orange} stroke={C.deep} strokeWidth={6} />)}
          </svg>
          {itens.map((it, i) => {
            const e = ent(t, it.t0, 0.8);
            return <div key={i} style={{ position: "absolute", left: it.x, top: it.y, width: it.w, padding: "32px 38px", borderRadius: 26, background: C.graphite, border: `2px solid ${C.line}`, color: C.white, fontFamily: FONTE, fontWeight: 800, fontSize: 46, lineHeight: 1.14, opacity: e, transform: `translateY(${(1 - e) * 42}px)` }}>{it.txt}</div>;
          })}
        </AbsoluteFill>
      )}
      {t > 100 && t < 104.2 && (
        <AbsoluteFill style={{ opacity: c }}>
          <PorQueNao t0={100.3} y={560} tam={132} />
          <div style={{ position: "absolute", top: 830, left: 80, right: 80 }}><Palavras texto="dar esse *próximo passo?*" t0={101.6} tam={74} peso={700} /></div>
        </AbsoluteFill>
      )}
      <AbsoluteFill style={{ opacity: d }}>
        <Img src={staticFile("dx/logo.png")} style={{ position: "absolute", left: 210, top: 520, width: 660, opacity: logo, transform: `translateY(${(1 - logo) * 34}px)` }} />
        <div style={{ position: "absolute", left: 90, right: 90, top: 690, textAlign: "center", fontFamily: FONTE, fontWeight: 500, fontSize: 40, color: C.mineral, opacity: frase }}>O digital a favor do que importa para você.</div>
        <div style={{ position: "absolute", left: 90, right: 90, top: 880, padding: "42px 30px", borderRadius: 34, background: C.orange, color: C.white, fontFamily: FONTE, fontWeight: 900, fontSize: 46, textAlign: "center", opacity: cta,
          transform: `translateY(${(1 - cta) * 40}px)`, boxShadow: `0 26px ${70 + brilho * 30}px rgba(234,91,37,${0.28 + brilho * 0.14})` }}>Vamos conversar sobre o seu site.</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const Diagnostico: React.FC<{ lead: Lead }> = ({ lead }) => {
  const t = useT();
  const hub = ent(t, 11.0, 0.7, VAIVEM) * (1 - ent(t, 21.9, 0.5, VAIVEM));
  const rua = ent(t, 21.9, 0.6, VAIVEM) * (1 - ent(t, 33.0, 0.6, VAIVEM));
  const nevoa = janela(t, 21.5, 22.9, 0.6);
  return (
    <AbsoluteFill style={{ background: C.deep }}>
      <Fundo />
      {t < 11.7 && <Abertura lead={lead} />}
      {t >= INI_HUB - 0.2 && t < FIM_HUB && (
        <AbsoluteFill style={{ opacity: hub, background: C.deep }}>
          <TelaPrint lead={lead} arq="home.png" nome="home" t={t} />
          <TelaPrint lead={lead} arq="mobile.png" nome="mobile" t={t} />
        </AbsoluteFill>
      )}
      <Sequence from={Math.round(INI_HUB * tl.fps)} durationInFrames={Math.round((FIM_HUB - INI_HUB) * tl.fps)} layout="none">
        <AbsoluteFill style={{ opacity: hub }}><OffthreadVideo src={staticFile("dx/placa_hub.webm")} transparent muted style={{ width: 1080, height: 1920 }} /></AbsoluteFill>
      </Sequence>
      <Sequence from={Math.round(INI_RUA * tl.fps)} durationInFrames={Math.round((FIM_RUA - INI_RUA) * tl.fps)} layout="none">
        <AbsoluteFill style={{ opacity: rua }}><OffthreadVideo src={staticFile("dx/placa_rua.mp4")} muted style={{ width: 1080, height: 1920 }} /></AbsoluteFill>
      </Sequence>
      {t >= 21 && t < 23 && <AbsoluteFill style={{ background: C.mineral, opacity: nevoa }} />}
      {t >= 28.5 && t < 33.8 && <AbsoluteFill style={{ opacity: rua }}><AbsoluteFill style={{ background: "rgba(17,24,39,.5)", opacity: ent(t, 28.8, 0.7) }} /><Celular lead={lead} k={ent(t, 28.8, 0.9)} /></AbsoluteFill>}
      {t >= 33 && t < 41 && <Convite lead={lead} />}
      {tl.pontos.map((s, i) => t >= s.ini && t < s.fim && <PontoCena key={i} lead={lead} ponto={lead.pontos[i]} n={i + 1} t0={s.ini} t1={s.fim} />)}
      {t >= 82.4 && <Fechamento lead={lead} />}
      <LegendaDx />
      <FaixaTeste lead={lead} />
      {SONS.map(([a, ts, v], i) => <Sequence key={i} from={Math.round(ts * tl.fps)} layout="none"><Audio src={staticFile(`dx/sfx/${a}.mp3`)} volume={v} /></Sequence>)}
      {AMBIENTES.map(([a, t0, t1, v], i) => {
        const dur = Math.round((t1 - t0) * tl.fps);
        return <Sequence key={a + i} from={Math.round(t0 * tl.fps)} durationInFrames={dur} layout="none"><Audio src={staticFile(`dx/sfx/${a}.mp3`)} loop volume={(f) => v * Math.min(1, f / 24, (dur - f) / 24)} /></Sequence>;
      })}
      {tl.falas.map((f) => <Sequence key={f.id} from={Math.round(f.ini * tl.fps)} layout="none"><Audio src={staticFile(`dx/${f.arquivo}`)} /></Sequence>)}
    </AbsoluteFill>
  );
};
