"use client";

import { REACTIONS } from "@/lib/reactions";
import type { Floating } from "@/lib/useReactions";

/** Sahnenin üstünde yüzen emojiler. Tıklamayı engellemez, ekran okuyuculardan gizlidir. */
export function ReactionOverlay({ floating }: { floating: Floating[] }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-hidden>
      {floating.map((f) => (
        <span key={f.key} className="reaction-float absolute bottom-2 text-3xl sm:text-4xl" style={{ left: `${f.left}%` }}>
          {f.emoji}
        </span>
      ))}
    </div>
  );
}

/** Tepki düğmeleri: cüzdan gerekmez, herkes aynı anda görür. */
export function ReactionBar({ counts, onSend }: { counts: Record<string, number>; onSend: (e: (typeof REACTIONS)[number]) => void }) {
  return (
    <div role="group" aria-label="Seyirci tepkileri" className="flex flex-wrap items-center justify-center gap-1.5">
      <span className="mr-1 text-xs text-mute">Tezahürat</span>
      {REACTIONS.map((e) => (
        <button
          key={e}
          type="button"
          onClick={() => onSend(e)}
          aria-label={`${e} gönder`}
          className="rounded-full border border-line px-2.5 py-1 text-base transition-transform hover:border-mute active:scale-90"
        >
          {e}
          {counts[e] ? <span className="ml-1 text-xs text-mute">{counts[e]}</span> : null}
        </button>
      ))}
    </div>
  );
}
