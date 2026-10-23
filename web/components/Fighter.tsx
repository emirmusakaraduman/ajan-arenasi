"use client";

import { slotColor, type AgentFrame } from "@/lib/playback";

/** Karakterin görünümü ajan adından üretilir: aynı ad her zaman aynı savaşçıyı verir. */
export type Look = { body: number; acc: number; weapon: number; eyes: number };

export const ACCESSORIES = 8;
export const WEAPONS = 6;

export function lookOf(name: string): Look {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619) >>> 0;
  // >>> (işaretsiz kaydırma): >> büyük sayılarda negatif verip silahı ve aksesuarı geçersiz kılıyordu
  return { body: h % 3, acc: (h >>> 3) % ACCESSORIES, weapon: (h >>> 6) % WEAPONS, eyes: (h >>> 9) % 3 };
}

const INK = "#0d1330";
const BODY = [
  { cy: -66, rx: 36, ry: 38 }, // yuvarlak
  { cy: -70, rx: 31, ry: 46 }, // uzun
  { cy: -60, rx: 43, ry: 34 }, // geniş
];
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const ease = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

type Props = {
  name: string;
  slot: number;
  frame: AgentFrame | null; // oynatma sırasında sahne verisi
  time: number;             // ms, yürüyüş ve nefes için
  won: boolean;
  deadStatic: boolean;
  hp?: number;              // canı azalan karakter endişeli görünür
};

function Weapon({ kind }: { kind: number }) {
  const s = { stroke: INK, strokeWidth: 3, strokeLinejoin: "round" as const };
  switch (kind) {
    case 0: // kılıç
      return (
        <g {...s}>
          <path d="M-5 8 L-5 50 L0 60 L5 50 L5 8 Z" fill="#e4eaff" />
          <rect x="-14" y="2" width="28" height="7" rx="3" fill="#ffcf5c" />
          <rect x="-3.5" y="-8" width="7" height="11" rx="2" fill="#8a5a2b" />
        </g>
      );
    case 1: // gürz
      return (
        <g {...s}>
          <rect x="-4" y="-4" width="8" height="34" rx="3" fill="#8a5a2b" />
          <circle cx="0" cy="42" r="14" fill="#9aa4c9" />
          {[0, 60, 120, 180, 240, 300].map((a) => (
            <path key={a} d="M-4 -12 L0 -22 L4 -12 Z" fill="#cfd6f3" transform={`translate(0 42) rotate(${a})`} />
          ))}
        </g>
      );
    case 2: // hançer
      return (
        <g {...s}>
          <path d="M-4 8 L-4 30 L0 40 L4 30 L4 8 Z" fill="#ffb3c0" />
          <rect x="-10" y="3" width="20" height="6" rx="3" fill="#ff5d73" />
          <rect x="-3" y="-6" width="6" height="10" rx="2" fill="#2a2f55" />
        </g>
      );
    case 3: // balta
      return (
        <g {...s}>
          <rect x="-3.5" y="-6" width="7" height="58" rx="3" fill="#8a5a2b" />
          <path d="M3 16 Q34 10 34 34 Q34 56 3 50 Z" fill="#cfd6f3" />
          <path d="M10 22 Q26 24 26 34" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
        </g>
      );
    case 4: // mızrak
      return (
        <g {...s}>
          <rect x="-3" y="-14" width="6" height="86" rx="3" fill="#8a5a2b" />
          <path d="M-8 70 L0 96 L8 70 Z" fill="#e4eaff" />
          <path d="M-9 70 L9 70" stroke="#ffcf5c" strokeWidth="4" strokeLinecap="round" />
        </g>
      );
    default: // çekiç
      return (
        <g {...s}>
          <rect x="-3.5" y="-6" width="7" height="52" rx="3" fill="#8a5a2b" />
          <rect x="-20" y="36" width="40" height="24" rx="5" fill="#9aa4c9" />
          <rect x="-20" y="44" width="40" height="7" fill="#ffcf5c" opacity="0.9" />
        </g>
      );
  }
}

export function Fighter({ name, slot, frame: f, time, won, deadStatic, hp = 10 }: Props) {
  const look = lookOf(name);
  const b = BODY[look.body];
  const fill = slotColor(slot, 46);
  const light = slotColor(slot, 68);
  const accent = `hsl(${(slot * 57 + 150) % 360} 70% 62%)`;
  const top = b.cy - b.ry;

  const alive = !(f ? f.hp <= 0.01 : deadStatic);
  const baseMood = f ? f.mood : deadStatic ? "dead" : won ? "happy" : "idle";
  // Canı az olan, başka bir şey yapmayan karakter endişelenir
  const worried = alive && baseMood === "idle" && (f ? f.hp : hp) <= 3;
  const mood = worried ? "worried" : baseMood;
  const fall = f ? f.fall : deadStatic ? 1 : 0;
  const lean = f?.lean ?? 0;
  const walking = (f?.walk ?? 0) > 0;
  const phase = f?.walk ?? 0;
  const swing = f?.swing ?? -1;
  const armUp = f ? f.armUp : won ? 1 : 0;
  const shield = f?.shield ?? 0;

  // Silah kolunun açısı: duruş, savurma (geri çekip indirme), dönüş, kol kaldırma
  let theta = -18, w = -105;
  if (swing >= 0 && swing <= 1) {
    if (swing < 0.4) {
      const p = ease(swing / 0.4);
      theta = lerp(-18, 160, p); w = lerp(-105, -40, p);
    } else {
      const p = ease((swing - 0.4) / 0.6);
      theta = lerp(160, -80, p); w = lerp(-40, 0, p);
    }
  } else if (swing > 1) {
    const p = ease(swing - 1);
    theta = lerp(-80, -18, p); w = lerp(0, -105, p);
  }
  if (armUp > 0) { theta = lerp(theta, -165, armUp); w = lerp(w, -10, armUp); }
  if (shield > 0.05) { theta = lerp(theta, 40, shield); w = lerp(w, -60, shield); }

  const bob = f ? Math.sin(time / 240 + slot) * 1.8 : 0;
  const stepL = walking ? Math.sin(phase) * 7 : 0;
  const stepR = walking ? -Math.sin(phase) * 7 : 0;
  const hop = walking ? -Math.abs(Math.sin(phase)) * 5 : 0;

  const gid = `bg-${slot}`;
  const eyeY = b.cy - 8;
  const eyeDx = look.eyes === 1 ? 14 : 11;
  const blinkDelay = `${(slot * 0.9 + look.body * 0.7) % 3.5}s`;

  return (
    <g>
      {/* Zemindeki gölge ve kazanan halkası */}
      <ellipse cx="0" cy="3" rx={40 - 6 * fall} ry="10" fill="#000" opacity="0.38" />
      {won && <ellipse cx="0" cy="3" rx="58" ry="15" fill="none" stroke="var(--gold)" strokeWidth="4" className="winner-glow" />}

      <g transform={`translate(0 ${hop + bob}) rotate(${-lean * 11 - fall * 88})`} opacity={deadStatic && !f ? 0.75 : 1} className={f || fall ? "" : "bob"}>
        <defs>
          <radialGradient id={gid} cx="34%" cy="26%" r="85%">
            <stop offset="0" stopColor={slotColor(slot, 64)} />
            <stop offset="0.55" stopColor={fill} />
            <stop offset="1" stopColor={slotColor(slot, 30)} />
          </radialGradient>
        </defs>
        {/* Bacaklar */}
        <rect x="-24" y={-30 + stepL} width="17" height="30" rx="8" fill={fill} stroke={INK} strokeWidth="3.5" />
        <rect x="7" y={-30 + stepR} width="17" height="30" rx="8" fill={fill} stroke={INK} strokeWidth="3.5" />

        {/* Aksesuar (gövdenin arkasında) */}
        {look.acc === 0 && (
          <g fill="#f2e6c9" stroke={INK} strokeWidth="3" strokeLinejoin="round">
            <path d={`M-26 ${top + 8} L-34 ${top - 22} L-9 ${top + 1} Z`} />
            <path d={`M26 ${top + 8} L34 ${top - 22} L9 ${top + 1} Z`} />
          </g>
        )}
        {look.acc === 1 && (
          <g fill={fill} stroke={INK} strokeWidth="3.5">
            <circle cx="-24" cy={top + 8} r="12" />
            <circle cx="24" cy={top + 8} r="12" />
            <circle cx="-24" cy={top + 8} r="5.5" fill={light} stroke="none" />
            <circle cx="24" cy={top + 8} r="5.5" fill={light} stroke="none" />
          </g>
        )}
        {look.acc === 4 && (
          <g stroke={INK} strokeWidth="3" strokeLinecap="round">
            <path d={`M0 ${top + 4} L-4 ${top - 22}`} fill="none" />
            <circle cx="-4" cy={top - 26} r="7" fill={accent} />
          </g>
        )}

        {/* Gövde */}
        <ellipse cx="0" cy={b.cy} rx={b.rx} ry={b.ry} fill={`url(#${gid})`} stroke={INK} strokeWidth="4" />
        <ellipse cx={-b.rx * 0.38} cy={b.cy - b.ry * 0.52} rx={b.rx * 0.3} ry={b.ry * 0.14} fill="#fff" opacity="0.3" transform={`rotate(-28 ${-b.rx * 0.38} ${b.cy - b.ry * 0.52})`} />
        <ellipse cx="2" cy={b.cy + 12} rx={b.rx * 0.56} ry={b.ry * 0.5} fill={light} opacity="0.5" />

        {/* Aksesuar (gövdenin önünde) */}
        {look.acc === 2 && (
          <path d={`M-14 ${top + 3} L-12 ${top - 18} L-5 ${top - 2} L0 ${top - 22} L6 ${top - 2} L13 ${top - 16} L15 ${top + 3} Z`} fill={accent} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
        )}
        {look.acc === 3 && (
          <path d={`M-18 ${top + 4} L-20 ${top - 16} L-9 ${top - 6} L0 ${top - 20} L9 ${top - 6} L20 ${top - 16} L18 ${top + 4} Z`} fill="#ffcf5c" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
        )}
        {look.acc === 5 && (
          <g stroke={INK} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round">
            <path d={`M${-b.rx + 3} ${b.cy - 26} Q0 ${b.cy - 36} ${b.rx - 3} ${b.cy - 26} L${b.rx - 4} ${b.cy - 18} Q0 ${b.cy - 28} ${-b.rx + 4} ${b.cy - 18} Z`} fill={accent} />
            <path d={`M${-b.rx + 4} ${b.cy - 22} l-16 6 m16 -6 l-14 14`} fill="none" />
          </g>
        )}
        {look.acc === 6 && (
          <g stroke={INK} strokeWidth="3.5" strokeLinejoin="round">
            <path d={`M${-b.rx + 2} ${b.cy - 18} Q${-b.rx + 2} ${top - 8} 0 ${top - 8} Q${b.rx - 2} ${top - 8} ${b.rx - 2} ${b.cy - 18} Z`} fill="#9aa4c9" />
            <rect x="-4" y={top - 8} width="8" height={b.cy - 14 - top} rx="3" fill="#cfd6f3" />
            <path d={`M0 ${top - 8} Q-10 ${top - 30} 6 ${top - 34} Q0 ${top - 22} 10 ${top - 12}`} fill={accent} />
          </g>
        )}
        {look.acc === 7 && (
          <g stroke={INK} strokeWidth="3.5" strokeLinejoin="round">
            <ellipse cx="0" cy={top + 6} rx={b.rx * 0.95} ry="7" fill="#4a3aa8" />
            <path d={`M-${b.rx * 0.6} ${top + 4} Q-4 ${top - 26} 8 ${top - 46} Q10 ${top - 22} ${b.rx * 0.6} ${top + 4} Z`} fill="#5b49c9" />
            <path d={`M-${b.rx * 0.5} ${top + 2} Q0 ${top - 2} ${b.rx * 0.5} ${top + 2}`} fill="none" stroke="#ffcf5c" strokeWidth="4" strokeLinecap="round" />
          </g>
        )}

        {/* Yüz */}
        {mood === "dead" ? (
          <g stroke={INK} strokeWidth="3.5" strokeLinecap="round">
            <path d={`M${-eyeDx - 6} ${eyeY - 6}l12 12m0 -12l-12 12`} />
            <path d={`M${eyeDx - 6} ${eyeY - 6}l12 12m0 -12l-12 12`} />
          </g>
        ) : mood === "hurt" ? (
          <g stroke={INK} strokeWidth="3.5" strokeLinecap="round" fill="none">
            <path d={`M${-eyeDx - 6} ${eyeY - 7}l11 7l-11 7`} />
            <path d={`M${eyeDx + 6} ${eyeY - 7}l-11 7l11 7`} />
          </g>
        ) : (
          <g>
            <g className="blink" style={{ animationDelay: blinkDelay }}>
              <ellipse cx={-eyeDx} cy={eyeY} rx="9" ry="11" fill="#fff" stroke={INK} strokeWidth="2.5" />
              <ellipse cx={eyeDx} cy={eyeY} rx="9" ry="11" fill="#fff" stroke={INK} strokeWidth="2.5" />
              {won ? (
                // Zaferde gözlerde yıldız parıltısı
                <g fill={INK}>
                  <path d={`M${-eyeDx + 3} ${eyeY - 6} l2 4 l4 1 l-3 3 l1 4 l-4 -2 l-4 2 l1 -4 l-3 -3 l4 -1 z`} />
                  <path d={`M${eyeDx + 3} ${eyeY - 6} l2 4 l4 1 l-3 3 l1 4 l-4 -2 l-4 2 l1 -4 l-3 -3 l4 -1 z`} />
                </g>
              ) : (
                <>
                  <circle cx={-eyeDx + 3.5} cy={eyeY + 1} r={worried ? 3.4 : 4.6} fill={INK} />
                  <circle cx={eyeDx + 3.5} cy={eyeY + 1} r={worried ? 3.4 : 4.6} fill={INK} />
                  <circle cx={-eyeDx + 5} cy={eyeY - 1} r="1.4" fill="#fff" />
                  <circle cx={eyeDx + 5} cy={eyeY - 1} r="1.4" fill="#fff" />
                </>
              )}
            </g>
            {mood === "angry" && (
              <g stroke={INK} strokeWidth="4" strokeLinecap="round">
                <path d={`M${-eyeDx - 11} ${eyeY - 15}L${-eyeDx + 9} ${eyeY - 9}`} />
                <path d={`M${eyeDx + 11} ${eyeY - 15}L${eyeDx - 9} ${eyeY - 9}`} />
              </g>
            )}
            {mood === "worried" && (
              <g stroke={INK} strokeWidth="3.5" strokeLinecap="round">
                <path d={`M${-eyeDx - 10} ${eyeY - 9}L${-eyeDx + 8} ${eyeY - 17}`} />
                <path d={`M${eyeDx + 10} ${eyeY - 9}L${eyeDx - 8} ${eyeY - 17}`} />
              </g>
            )}
          </g>
        )}
        {mood !== "dead" && mood !== "hurt" && (
          <g fill="#ff7aa8" opacity="0.32">
            <ellipse cx={-eyeDx - 7} cy={eyeY + 15} rx="6" ry="3.6" />
            <ellipse cx={eyeDx + 7} cy={eyeY + 15} rx="6" ry="3.6" />
          </g>
        )}
        <g stroke={INK} strokeWidth="3.5" strokeLinecap="round" fill="none">
          {mood === "angry" && (
            <>
              <path d={`M-11 ${eyeY + 19}q11 -10 22 0`} fill="#fff" />
              <path d={`M-5 ${eyeY + 16}v4 M0 ${eyeY + 15}v5 M5 ${eyeY + 16}v4`} strokeWidth="2" />
            </>
          )}
          {mood === "happy" && <path d={`M-13 ${eyeY + 14}q13 16 26 0`} fill="#7a1f3a" />}
          {mood === "hurt" && <ellipse cx="0" cy={eyeY + 20} rx="5" ry="6" fill={INK} />}
          {mood === "idle" && <path d={`M-8 ${eyeY + 19}h16`} />}
          {mood === "worried" && <path d={`M-9 ${eyeY + 22}q9 -7 18 0`} />}
          {mood === "dead" && <path d={`M-9 ${eyeY + 20}h18`} />}
        </g>
        {/* Endişeli karakterin alnında ter damlası */}
        {mood === "worried" && (
          <path d={`M${b.rx * 0.5} ${top + 14} q-6 10 0 14 q6 -4 0 -14z`} fill="#8fd4ff" stroke={INK} strokeWidth="2" className="drip" />
        )}

        {/* Kalkan */}
        {shield > 0.02 && (
          <g transform={`translate(30 ${b.cy + 4}) scale(${shield})`}>
            <circle r="27" fill="#5b9bff" stroke={INK} strokeWidth="4" />
            <circle r="17" fill="none" stroke="#bcd6ff" strokeWidth="3" />
            <circle r="5" fill="#dfe9ff" stroke={INK} strokeWidth="2" />
          </g>
        )}

        {/* Silah kolu */}
        <g transform={`translate(${b.rx - 6} ${b.cy + 2}) rotate(${theta})`}>
          <rect x="-6.5" y="-4" width="13" height="32" rx="6.5" fill={fill} stroke={INK} strokeWidth="3.5" />
          <circle cx="0" cy="30" r="8.5" fill={light} stroke={INK} strokeWidth="3" />
          <g transform={`translate(0 30) rotate(${w})`}>
            <Weapon kind={look.weapon} />
          </g>
        </g>

        {/* Vuruş parlaması */}
        {f && f.flash > 0.01 && <ellipse cx="0" cy={b.cy} rx={b.rx} ry={b.ry} fill="#fff" opacity={f.flash * 0.75} />}
      </g>
    </g>
  );
}
