"use client";

import { useEffect, useMemo, useState } from "react";
import type { Agent, MatchInfo } from "@/lib/useMatch";
import { depthScale, FLOOR, H, slotColor, slotPos, W, type Effect, type Frame, type Intent } from "@/lib/playback";
import { MAX_HP } from "@/lib/arena";
import { THEMES, type Theme } from "@/lib/themes";
import { Fighter } from "./Fighter";

const TONE = { hit: "#ff5d73", gold: "#ffcf5c", ally: "#4be3b0", mute: "#c9cffa" } as const;
const INTENT: Record<Intent, { color: string; path: string }> = {
  sword: { color: "#ff5d73", path: "M-6 6L6 -6M-5 1L-1 5M2 -6H6V-2" },
  shield: { color: "#5b9bff", path: "M0 -7L6 -4V1C6 4 3 6 0 7C-3 6 -6 4 -6 1V-4Z" },
  heart: { color: "#2fbf8f", path: "M0 6C-8 0 -5 -7 0 -3C5 -7 8 0 0 6Z" },
  idle: { color: "#59618f", path: "M-5 0H-4M-1 0H1M4 0H5" },
  steal: { color: "#f59e0b", path: "M-6 0H5M1 -4L5 0L1 4" },
  charge: { color: "#ff9a4d", path: "M1 -7L-4 1H0L-1 7L4 -1H0Z" },
  pact: { color: "#4be3b0", path: "M-6 3A6 6 0 0 1 0 -3A6 6 0 0 1 6 3M-3 3H3" },
};
const hpColor = (hp: number) => (hp > 6 ? "var(--ally)" : hp > 3 ? "var(--gold)" : "var(--hit)");

type Props = {
  agents: Agent[];
  hp: number[];
  match: MatchInfo;
  frame: Frame | null;
  commits: boolean[];
  round: number;
  status: string;
  settled: boolean;
  speaking: number[];
  theme?: Theme;
};

export function Stage({ agents, hp, match, frame, commits, round, status, settled, speaking, theme = THEMES[0] }: Props) {
  const n = agents.length;
  // Dar ekranda sahnenin boş kenarları kırpılır, karakterler büyür
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const finished = match.phase === 3 && settled && !frame;
  const cap = frame?.caption;

  // Tribündeki seyirciler: sabit tohumdan üretilir, her render'da aynı kalır
  const crowdHue = (k: number) => theme.crowd[0] + ((k * 47) % Math.max(theme.crowd[1] - theme.crowd[0], 1));
  const crowd = useMemo(
    () =>
      Array.from({ length: 64 }, (_, k) => {
        const row = Math.floor(k / 16);
        const col = k % 16;
        const x = 40 + col * 48 + (row % 2) * 24 + ((k * 37) % 11) - 5;
        const y = 150 - row * 26 + ((k * 13) % 7);
        return { x, y, hue: crowdHue(k), d: (k % 7) * 0.25 };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme.key],
  );

  const z = frame?.camera.zoom ?? 1;
  const cam = `translate(${W / 2 - z * (frame?.camera.x ?? W / 2)} ${H / 2 - z * (frame?.camera.y ?? H / 2)}) scale(${z})`;

  const order = agents
    .map((_, i) => i)
    .sort((a, b) => slotPos(a, n).y + (frame?.agents[a].dy ?? 0) - (slotPos(b, n).y + (frame?.agents[b].dy ?? 0)));

  return (
    <div>
      {/* Dövüş oyunu tarzı üst çubuk: portre, ad, can */}
      <ul className="mb-3 grid grid-cols-3 gap-1.5 sm:flex sm:flex-wrap sm:justify-center sm:gap-2">
        {agents.map((a, i) => {
          const h = frame ? frame.agents[i].hp : hp[i];
          const dead = h <= 0.01;
          const won = finished && match.winnerSlot === i;
          return (
            <li key={i} className={`flex min-w-0 items-center gap-2.5 rounded-lg border px-2 py-1.5 sm:min-w-[150px] sm:flex-1 sm:px-2.5 sm:py-2 ${won ? "border-gold" : "border-line"} ${dead ? "opacity-45" : ""}`} style={{ background: "rgba(20,28,71,0.7)" }}>
              <span className="hidden h-9 w-9 shrink-0 place-items-center rounded-md font-display text-base font-bold text-white sm:grid" style={{ background: slotColor(i), boxShadow: "inset 0 -3px 0 rgba(0,0,0,.25)" }}>
                {a.name.slice(0, 1).toLocaleUpperCase("tr-TR")}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <b className="truncate text-xs sm:text-sm">{a.name}</b>
                  <span className="hidden text-xs tabular-nums text-mute sm:inline">{Math.max(Math.round(h), 0)}/{MAX_HP}</span>
                </div>
                <div className="mt-1 flex gap-[2px]" role="meter" aria-valuenow={Math.round(h)} aria-valuemin={0} aria-valuemax={MAX_HP} aria-label={`${a.name} can`}>
                  {Array.from({ length: MAX_HP }, (_, s) => {
                    const fill = Math.min(1, Math.max(0, h - s));
                    return (
                      <span key={s} className="relative h-2.5 flex-1 overflow-hidden rounded-[2px] bg-white/10">
                        <span className="absolute inset-y-0 left-0" style={{ width: `${fill * 100}%`, background: hpColor(h) }} />
                      </span>
                    );
                  })}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <svg viewBox={narrow ? "70 24 660 466" : `0 0 ${W} ${H}`} className="block w-full rounded-2xl" role="img" aria-label={`Arena: ${agents.map((a, i) => `${a.name} ${hp[i]} can`).join(", ")}`}>
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={theme.sky[0]} />
            <stop offset="1" stopColor={theme.sky[1]} />
          </linearGradient>
          <radialGradient id="floor" cx="50%" cy="45%" r="60%">
            <stop offset="0" stopColor={theme.floor[0]} />
            <stop offset="0.7" stopColor={theme.floor[1]} />
            <stop offset="1" stopColor={theme.floor[2]} />
          </radialGradient>
          <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={theme.beam} stopOpacity="0.38" />
            <stop offset="1" stopColor={theme.beam} stopOpacity="0" />
          </linearGradient>
          <radialGradient id="torchGlow">
            <stop offset="0" stopColor={theme.glow} stopOpacity="0.55" />
            <stop offset="1" stopColor={theme.glow} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="vig-dark" cx="50%" cy="50%" r="70%">
            <stop offset="0.35" stopColor="#05071a" stopOpacity="0" />
            <stop offset="1" stopColor="#05071a" stopOpacity="1" />
          </radialGradient>
          <radialGradient id="vig-gold" cx="50%" cy="50%" r="70%">
            <stop offset="0.3" stopColor="#ffcf5c" stopOpacity="0" />
            <stop offset="1" stopColor="#ffcf5c" stopOpacity="1" />
          </radialGradient>
        </defs>

        <g transform={cam}>
        {/* Gökyüzü ve tribün */}
        <rect width={W} height={H} fill="url(#sky)" />
        <g opacity="0.9">
          {crowd.map((c, k) => (
            <g key={k} className="bob" style={{ animationDelay: `${c.d}s`, animationDuration: "1.6s" }}>
              <circle cx={c.x} cy={c.y} r="9" fill={`hsl(${c.hue} 35% 26%)`} />
              <rect x={c.x - 9} y={c.y + 6} width="18" height="16" rx="8" fill={`hsl(${c.hue} 35% 20%)`} />
            </g>
          ))}
        </g>
        <path d={`M0 170 Q${W / 2} 125 ${W} 170 V210 H0 Z`} fill="#0d1330" opacity="0.65" />
        {/* Spot ışıkları */}
        <g className="sway" style={{ transformOrigin: "120px 0px" }}><path d="M120 0 L330 300 L10 300 Z" fill="url(#beam)" /></g>
        <g className="sway" style={{ transformOrigin: "680px 0px", animationDelay: "-2s" }}><path d="M680 0 L790 300 L470 300 Z" fill="url(#beam)" /></g>
        <g className="sway" style={{ transformOrigin: "400px 0px", animationDelay: "-4s" }}><path d="M400 0 L520 330 L280 330 Z" fill="url(#beam)" opacity="0.7" /></g>
        {/* Meşaleler */}
        {[56, 744].map((tx, k) => (
          <g key={tx} transform={`translate(${tx} 300)`}>
            <circle r="46" fill="url(#torchGlow)" opacity="0.8" />
            <rect x="-4" y="0" width="8" height="64" rx="3" fill="#3a2a22" stroke="#0d1330" strokeWidth="2.5" />
            <path d="M-12 0 L12 0 L8 -10 L-8 -10 Z" fill="#6b4a33" stroke="#0d1330" strokeWidth="2.5" strokeLinejoin="round" />
            <g className="flame" style={{ animationDelay: `${k * 0.17}s` }}>
              <path d="M0 -50 C14 -30 14 -18 0 -10 C-14 -18 -14 -30 0 -50 Z" fill={theme.flame[0]} />
              <path d="M0 -38 C7 -28 7 -21 0 -14 C-7 -21 -7 -28 0 -38 Z" fill={theme.flame[1]} />
            </g>
          </g>
        ))}

        {/* Zemin */}
        <ellipse cx={FLOOR.cx} cy={FLOOR.cy + 8} rx={FLOOR.rx + 46} ry={FLOOR.ry + 36} fill={theme.ground} />
        <ellipse cx={FLOOR.cx} cy={FLOOR.cy} rx={FLOOR.rx + 40} ry={FLOOR.ry + 30} fill="url(#floor)" stroke={theme.rim} strokeWidth="3" />
        <ellipse cx={FLOOR.cx} cy={FLOOR.cy} rx={FLOOR.rx} ry={FLOOR.ry} fill="none" stroke={theme.ring} strokeOpacity="0.4" strokeWidth="2" strokeDasharray="3 9" />
        <g transform={`translate(${FLOOR.cx} ${FLOOR.cy}) scale(1 ${FLOOR.ry / FLOOR.rx})`} stroke={theme.ring} strokeOpacity="0.22" strokeWidth="3" fill="none">
          <circle r="170" />
          <path d="M0 -170 L147 85 L-147 85 Z M0 170 L147 -85 L-147 -85 Z" />
        </g>
        {theme.cracks && (
          <g fill="none" stroke={theme.cracks} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="lava-glow">
            <path d="M120 360 L168 338 L200 352 L246 330" />
            <path d="M560 372 L608 350 L640 364 L690 338" />
            <path d="M330 420 L360 400 L392 412 L430 394" />
            <path d="M246 330 L262 304 M608 350 L596 322" />
          </g>
        )}
        <text x={FLOOR.cx} y={FLOOR.cy - 4} textAnchor="middle" fontSize="54" fill="#ffffff" fillOpacity="0.1" style={{ fontFamily: "var(--font-inter)", fontWeight: 800 }}>
          {match.phase === 1 ? "Bahis" : finished ? "Bitti" : `Tur ${Math.min(round + 1, match.maxRounds)}`}
        </text>
        <text x={FLOOR.cx} y={FLOOR.cy + 26} textAnchor="middle" fontSize="16" fill="#c9cffa" fillOpacity="0.7">
          {status}
        </text>

        {/* Ortam parçacıkları: toz, kar ya da kor */}
        <g aria-hidden pointerEvents="none">
          {Array.from({ length: 26 }, (_, k) => {
            const x = 30 + ((k * 97) % 740);
            const y = theme.particle === "ember" ? 380 + ((k * 31) % 90) : 40 + ((k * 53) % 380);
            const r = theme.particle === "snow" ? 2 + (k % 3) : 1.6 + (k % 3) * 0.7;
            const col = theme.particle === "snow" ? "#ffffff" : theme.particle === "ember" ? theme.flame[0] : theme.beam;
            return <circle key={k} cx={x} cy={y} r={r} fill={col} opacity={theme.particle === "dust" ? 0.28 : 0.7} className={`amb amb-${theme.particle}`} style={{ animationDelay: `${-(k * 0.73) % 9}s`, animationDuration: `${6 + (k % 5)}s` }} />;
          })}
        </g>

        {/* Savaşçılar: arkadan öne doğru çizilir */}
        {order.map((i) => {
          const a = agents[i];
          const home = slotPos(i, n);
          const f = frame?.agents[i];
          const x = home.x + (f?.dx ?? 0), y = home.y + (f?.dy ?? 0);
          const s = depthScale(y);
          const dead = (f ? f.hp : hp[i]) <= 0.01;
          const won = finished && match.winnerSlot === i;
          const facing = f?.facing ?? (home.x <= FLOOR.cx ? 1 : -1);
          const tagW = Math.max(60, a.name.length * 9.5 + 22);
          return (
            <g key={i} transform={`translate(${x} ${y})`} opacity={f ? f.opacity : dead ? 0.7 : 1}>
              <g transform={`scale(${facing * s} ${s})`}>
                <Fighter name={a.name} slot={i} frame={f ?? null} time={frame?.time ?? 0} won={won} deadStatic={dead && !f} hp={hp[i]} />
              </g>
              {/* Ad etiketi ve durum rozetleri */}
              <g transform={`scale(${s})`}>
                {!dead && (
                  <g transform="translate(0 -150)">
                    <rect x={-tagW / 2} y="-12" width={tagW} height="24" rx="12" fill="#0d1330" fillOpacity="0.8" stroke={slotColor(i, 60)} strokeWidth="2" />
                    <text textAnchor="middle" dy="0.35em" fontSize="14" fontWeight="700" fill="#eef0ff">{a.name}</text>
                    {speaking.includes(i) && (
                      <g transform={`translate(${-tagW / 2 - 16} 0)`}>
                        <title>Konuştu</title>
                        <path d="M-12 -9h24a4 4 0 0 1 4 4v9a4 4 0 0 1-4 4h-11l-7 6v-6h-6a4 4 0 0 1-4-4v-9a4 4 0 0 1 4-4z" fill="#eef0ff" />
                        <circle cx="-5" cy="-1" r="1.9" fill="#0d1330" />
                        <circle cx="0" cy="-1" r="1.9" fill="#0d1330" />
                        <circle cx="5" cy="-1" r="1.9" fill="#0d1330" />
                      </g>
                    )}
                    {!f && commits[i] && match.phase === 2 && (
                      <g transform={`translate(${tagW / 2 + 15} 0)`}>
                        <title>Hamle kilitlendi</title>
                        <circle r="12" fill="var(--monad)" />
                        <path d="M-3.5 -1V-3a3.5 3.5 0 0 1 7 0V-1M-5 -1h10v7h-10z" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
                      </g>
                    )}
                  </g>
                )}
                {f?.intent && f.intentAlpha > 0.01 && (
                  <g transform={`translate(0 ${-182}) scale(${0.6 + 0.4 * f.intentAlpha})`} opacity={f.intentAlpha}>
                    <circle r="17" fill={INTENT[f.intent].color} stroke="#0d1330" strokeWidth="2.5" />
                    <path d={INTENT[f.intent].path} fill={f.intent === "heart" || f.intent === "shield" ? "#fff" : "none"} stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" transform="scale(1.1)" />
                  </g>
                )}
              </g>
            </g>
          );
        })}

        {/* Vuruş efektleri */}
        {frame?.effects.map((e, k) => <EffectView key={k} e={e} />)}

        </g>

        {/* Üstte çizgi roman tarzı başlık */}
        {cap && cap.alpha > 0.01 && (
          <g opacity={cap.alpha} transform={`translate(${W / 2} 52) rotate(-2) scale(${0.9 + 0.1 * cap.alpha})`}>
            <rect x="-230" y="-26" width="460" height="52" rx="10" fill="#0d1330" fillOpacity="0.92" stroke={TONE[cap.tone]} strokeWidth="4" />
            <text textAnchor="middle" dy="0.35em" fontSize="21" fill={TONE[cap.tone]} style={{ fontFamily: "var(--font-inter)", fontWeight: 800 }}>
              {cap.text}
            </text>
          </g>
        )}

        {frame?.title && (
          <g opacity={frame.title.alpha} transform={`translate(${W / 2} ${H / 2 - 24}) scale(${frame.title.scale})`}>
            <text textAnchor="middle" dy="0.35em" fontSize="84" fill="#fff" style={{ fontFamily: "var(--font-inter)", fontWeight: 800, paintOrder: "stroke", stroke: "#0d1330", strokeWidth: 12, strokeLinejoin: "round" }}>
              {frame.title.text}
            </text>
          </g>
        )}

        {/* İhanette ekran kararır, vuruşta altın parlar */}
        {frame?.vignette && (
          <rect width={W} height={H} fill={frame.vignette.color === "#ffcf5c" ? "url(#vig-gold)" : "url(#vig-dark)"} opacity={frame.vignette.alpha} pointerEvents="none" />
        )}
      </svg>
    </div>
  );
}

function EffectView({ e }: { e: Effect }) {
  if (e.type === "slash") {
    const col = e.gold ? "#ffcf5c" : "#ff5d73";
    return (
      <g transform={`translate(${e.x} ${e.y}) scale(${e.dir * (e.gold ? 1.6 : 1.15)} ${e.gold ? 1.6 : 1.15})`}>
        <path d="M-34 -34Q14 -12 34 34" pathLength={1} fill="none" stroke={col} strokeWidth={8} strokeLinecap="round" strokeDasharray="1" strokeDashoffset={1 - e.p} opacity={1 - e.p * 0.5} />
        <path d="M-18 -40Q26 -8 38 18" pathLength={1} fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeDasharray="1" strokeDashoffset={1 - Math.min(1, e.p * 1.3)} opacity={0.85 * (1 - e.p)} />
      </g>
    );
  }
  if (e.type === "star") {
    const r = (e.gold ? 54 : 38) * (0.4 + 0.9 * Math.sin(Math.min(1, e.p * 1.4) * Math.PI * 0.5));
    const pts = Array.from({ length: 16 }, (_, i) => {
      const a = (i / 16) * Math.PI * 2;
      const rr = i % 2 ? r * 0.5 : r;
      return `${Math.cos(a) * rr},${Math.sin(a) * rr}`;
    }).join(" ");
    return (
      <g transform={`translate(${e.x} ${e.y}) rotate(${e.p * 25})`} opacity={1 - e.p * e.p}>
        <polygon points={pts} fill={e.gold ? "#ffcf5c" : "#ffd9a0"} stroke="#0d1330" strokeWidth="3.5" strokeLinejoin="round" />
        <polygon points={pts} fill={e.gold ? "#fff3c4" : "#ff5d73"} transform="scale(0.55)" />
      </g>
    );
  }
  if (e.type === "spark") {
    return (
      <g transform={`translate(${e.x} ${e.y})`} opacity={1 - e.p}>
        {Array.from({ length: 8 }, (_, s) => {
          const a = (s / 8) * Math.PI * 2;
          const r1 = 8 + 20 * e.p, r2 = r1 + 10;
          return <line key={s} x1={Math.cos(a) * r1} y1={Math.sin(a) * r1} x2={Math.cos(a) * r2} y2={Math.sin(a) * r2} stroke="#bcd6ff" strokeWidth="4" strokeLinecap="round" />;
        })}
      </g>
    );
  }
  if (e.type === "burst") {
    return <ellipse cx={e.x} cy={e.y} rx={14 + 80 * e.p} ry={(14 + 80 * e.p) * 0.6} fill="none" stroke={e.color} strokeWidth={5 * (1 - e.p) + 1} opacity={1 - e.p} />;
  }
  if (e.type === "dust") {
    const r = 8 + 22 * e.p;
    return <ellipse cx={e.x + (e.k % 2 ? 1 : -1) * e.p * 16} cy={e.y - e.p * 9} rx={r} ry={r * 0.55} fill="#c9cffa" opacity={0.42 * (1 - e.p)} />;
  }
  return (
    <text x={e.x} y={e.y} textAnchor="middle" fontSize="34" fill={e.color} opacity={1 - e.p * e.p} style={{ fontFamily: "var(--font-inter)", fontWeight: 800, paintOrder: "stroke", stroke: "#0d1330", strokeWidth: 6 }}>
      {e.text}
    </text>
  );
}
