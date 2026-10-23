"use client";

import { slotColor } from "@/lib/playback";
import type { Agent, Msg } from "@/lib/useMatch";

/** Hamleler kilitlenmeden önce ajanların herkese açık pazarlığı */
export function ChatStrip({ agents, messages }: { agents: Agent[]; messages: Msg[] }) {
  if (messages.length === 0) return null;
  return (
    <ul aria-label="Ajanların pazarlığı" className="flex flex-col gap-2 rounded-xl border border-line bg-deep/60 p-3">
      {messages.map((m, k) => (
        <li key={k} className="flex items-start gap-2.5 text-sm leading-snug">
          <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: slotColor(m.slot, 52) }} aria-hidden />
          <span>
            <b className="text-chalk">{agents[m.slot]?.name}</b> <span className="text-chalk/85">{m.text}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
