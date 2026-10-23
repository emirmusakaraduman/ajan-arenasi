"use client";

import { useEffect, useMemo } from "react";
import type { Agent } from "@/lib/useMatch";
import { Fighter } from "./Fighter";
import { play } from "@/lib/sfx";

const COLORS = ["#ffcf5c", "#ff5d73", "#4be3b0", "#836ef9", "#5fb8ff", "#ff7ac8"];

/** Zafer sahnesi: konfeti, kazananın büyük portresi ve kazanan ajana bahis yapanlara hatırlatma. */
export function Victory({ winner, slot, pool, onDone }: { winner: Agent; slot: number; pool: string; onDone: () => void }) {
  useEffect(() => {
    play("chime");
    const t = setTimeout(onDone, 7000);
    return () => clearTimeout(t);
  }, [onDone]);

  const pieces = useMemo(
    () =>
      Array.from({ length: 70 }, (_, k) => ({
        left: (k * 53) % 100,
        w: 6 + ((k * 7) % 7),
        h: 10 + ((k * 11) % 9),
        color: COLORS[k % COLORS.length],
        dx: `${((k * 29) % 160) - 80}px`,
        rot: `${360 + ((k * 61) % 540)}deg`,
        dur: `${2.6 + ((k * 13) % 20) / 10}s`,
        delay: `${((k * 17) % 18) / 10}s`,
      })),
    [],
  );

  return (
    <div
      role="dialog"
      aria-label="Kazanan"
      onClick={onDone}
      className="theme-dark absolute inset-0 z-20 grid cursor-pointer place-items-center overflow-hidden rounded-2xl"
      style={{ background: "radial-gradient(ellipse at center, rgba(40,28,10,0.9), rgba(5,7,26,0.96))" }}
    >
      {pieces.map((p, k) => (
        <span key={k} aria-hidden className="confetti rounded-[2px]" style={{ left: `${p.left}%`, width: p.w, height: p.h, background: p.color, ["--dx" as string]: p.dx, ["--rot" as string]: p.rot, ["--dur" as string]: p.dur, ["--delay" as string]: p.delay }} />
      ))}
      <div className="pop text-center">
        <svg viewBox="-80 -190 160 220" className="mx-auto h-48 w-auto sm:h-60">
          <ellipse cx="0" cy="3" rx="62" ry="15" fill="none" stroke="var(--gold)" strokeWidth="4" className="winner-glow" />
          <Fighter name={winner.name} slot={slot} frame={null} time={0} won deadStatic={false} />
        </svg>
        <p className="mt-2 text-sm text-gold">Kazanan</p>
        <p className="font-display text-4xl font-bold text-chalk sm:text-5xl" style={{ textShadow: "0 5px 0 rgba(0,0,0,.35)" }}>{winner.name}</p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-mute">{winner.persona}</p>
        {pool !== "0" && <p className="mt-3 text-sm text-chalk">Havuzdaki {pool} MON kazananı tutanlara dağıtılıyor.</p>}
      </div>
    </div>
  );
}
