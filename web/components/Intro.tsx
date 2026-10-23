"use client";

import { useEffect, useState } from "react";
import type { Agent } from "@/lib/useMatch";
import { Fighter } from "./Fighter";
import { slotColor } from "@/lib/playback";
import { play } from "@/lib/sfx";

const END = 7400;

/** Maç tanıtımı: başlık, karşılaşma kartları ve geri sayım. Tıklayınca atlanır. */
export function Intro({ agents, matchId, onDone }: { agents: Agent[]; matchId: number; onDone: () => void }) {
  const [t, setT] = useState(0);

  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const e = now - start;
      if (e >= END) return onDone();
      setT(e);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [onDone]);

  // Geri sayım sesleri
  // her sayı yaklaşık bir saniye ekranda kalır
  const count = t < 3400 ? null : t < 4400 ? "3" : t < 5400 ? "2" : t < 6400 ? "1" : "Dövüş!";
  useEffect(() => {
    if (count) play(count === "Dövüş!" ? "betray" : "tick");
  }, [count]);

  const n = agents.length;
  return (
    <div
      role="dialog"
      aria-label={`Maç ${matchId} tanıtımı`}
      onClick={onDone}
      className="theme-dark absolute inset-0 z-20 grid cursor-pointer place-items-center overflow-hidden rounded-2xl"
      style={{ background: "radial-gradient(ellipse at center, rgba(27,20,87,0.96), rgba(5,7,26,0.98))" }}
    >
      {t < 1400 && (
        <div className="pop text-center">
          <p className="font-display text-4xl font-bold text-chalk sm:text-6xl">Maç #{matchId}</p>
          <p className="mt-3 text-base text-mute">{n} ajan, tek kazanan</p>
        </div>
      )}

      {t >= 1300 && t < 3500 && (
        <div className="flex w-full flex-wrap items-center justify-center gap-x-3 gap-y-5 px-4">
          {agents.map((a, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className={`${i % 2 ? "slide-r" : "slide-l"} w-[132px] text-center`} style={{ animationDelay: `${i * 90}ms` }}>
                <svg viewBox="-75 -190 150 215" className="mx-auto h-36 w-auto">
                  <ellipse cx="0" cy="4" rx="46" ry="11" fill={slotColor(i, 40)} opacity="0.35" />
                  <Fighter name={a.name} slot={i} frame={null} time={0} won={false} deadStatic={false} />
                </svg>
                <p className="mt-1 font-display text-base font-medium text-chalk">{a.name}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-mute">{a.persona || "Kişiliği belirsiz"}</p>
                <p className="mt-1 text-xs text-chalk/70">{a.wins} galibiyet</p>
              </div>
              {n === 2 && i === 0 && <span className="pop font-display text-4xl font-bold text-gold">VS</span>}
            </div>
          ))}
        </div>
      )}

      {count && (
        <p key={count} className="pop font-display text-7xl font-bold text-chalk sm:text-8xl" style={{ color: count === "Dövüş!" ? "var(--gold)" : undefined, textShadow: "0 6px 0 rgba(0,0,0,.35)" }}>
          {count}
        </p>
      )}

      <span className="absolute bottom-3 right-4 text-xs text-mute">Atlamak için tıkla</span>
    </div>
  );
}
