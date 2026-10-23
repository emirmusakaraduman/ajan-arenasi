"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Reaction, ReactionItem } from "./reactions";

export type Floating = { key: string; emoji: Reaction; left: number };

/** Seyirci tepkilerini kısa aralıkla çeker; yeni gelenleri sahne üstünde yüzen emoji olarak verir. */
export function useReactions(matchId: number) {
  const [floating, setFloating] = useState<Floating[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const after = useRef<number | null>(null); // ilk çekimde eskiler oynatılmaz, yalnızca sayaç alınır
  const mine = useRef(new Set<number>()); // kendi gönderdiklerimiz zaten anında gösterildi
  const seq = useRef(0);

  const spawn = useCallback((emoji: Reaction, tag: string) => {
    const key = `${tag}-${seq.current++}`;
    setFloating((f) => [...f.slice(-24), { key, emoji, left: 8 + Math.random() * 84 }]);
    setTimeout(() => setFloating((f) => f.filter((x) => x.key !== key)), 3200);
  }, []);

  useEffect(() => {
    let stop = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/react?matchId=${matchId}&after=${after.current ?? 0}`, { cache: "no-store" });
        if (!res.ok || stop) return;
        const data: { latest: number; items: ReactionItem[]; counts: Record<string, number> } = await res.json();
        setCounts(data.counts);
        if (after.current !== null) {
          for (const it of data.items.slice(-12)) if (!mine.current.delete(it.id)) spawn(it.emoji, `r${it.id}`);
        }
        after.current = data.latest;
      } catch {}
    };
    poll();
    const t = setInterval(poll, 1500);
    return () => { stop = true; clearInterval(t); };
  }, [matchId, spawn]);

  const send = useCallback(
    async (emoji: Reaction) => {
      spawn(emoji, "me");
      setCounts((c) => ({ ...c, [emoji]: (c[emoji] ?? 0) + 1 }));
      try {
        const res = await fetch("/api/react", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ matchId, emoji }) });
        if (res.ok) mine.current.add((await res.json()).id);
      } catch {}
    },
    [matchId, spawn],
  );

  return { floating, counts, send };
}
