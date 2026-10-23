"use client";

import { MAX_HP } from "@/lib/arena";
import { slotColor } from "@/lib/playback";
import type { Agent } from "@/lib/useMatch";

const hpColor = (hp: number) => (hp > 6 ? "var(--ally)" : hp > 3 ? "var(--gold)" : "var(--hit)");

/** Dövüş oyunu tarzı üst çubuk: portre, ad ve segmentli can çubuğu. */
export function HudBar({ agents, hp, finished, winnerSlot }: { agents: Agent[]; hp: number[]; finished: boolean; winnerSlot: number }) {
  return (
    <ul className="mb-3 grid grid-cols-3 gap-1.5 sm:flex sm:flex-wrap sm:justify-center sm:gap-2">
      {agents.map((a, i) => {
        const h = hp[i] ?? MAX_HP;
        const dead = h <= 0.01;
        const won = finished && winnerSlot === i;
        return (
          <li
            key={i}
            className={`flex min-w-0 items-center gap-2.5 rounded-lg border px-2 py-1.5 sm:min-w-[150px] sm:flex-1 sm:px-2.5 sm:py-2 ${won ? "border-gold" : "border-line"} ${dead ? "opacity-45" : ""}`}
            style={{ background: "rgba(20,28,71,0.7)" }}
          >
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
  );
}
