"use client";

import { useEffect, useRef, useState } from "react";
import { ARENA_ADDRESS, read } from "./arena";
import type { Agent } from "./useMatch";

export type MatchCard = {
  id: number; phase: number; round: number; maxRounds: number; bettingEnd: number;
  winnerSlot: number; pool: bigint; agentIds: number[]; agents: Agent[];
  /** ajan başına yatırılan toplam bahis (bitmiş maçlarda okunmaz, boş gelir) */
  stakes: bigint[];
};

// Sayfalar arasında gidip gelince lobi beklemeden açılsın: son liste ve ajanlar modül düzeyinde saklanır
const agentCache = new Map<number, Agent>();
let lastCards: MatchCard[] | null = null;
let lastCount = 0;

/** Lobi için son maçların özeti. Ajan bilgileri kimlik başına bir kez çekilir; son liste önbellekten hemen gösterilir. */
export function useLobby(limit = 12) {
  const [cards, setCards] = useState<MatchCard[] | null>(lastCards);
  const [count, setCount] = useState(lastCount);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    if (!ARENA_ADDRESS) return;
    const load = async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        const n = Number(await read<bigint>("matchCount"));
        const ids = Array.from({ length: Math.min(n, limit) }, (_, i) => n - i);
        const raw = await Promise.all(
          ids.map((id) => Promise.all([read<any>("getMatch", [BigInt(id)]), read<bigint[]>("getMatchAgents", [BigInt(id)])])),
        );
        // eksik ajanlar aynı anda istenir (okumalar tek multicall çağrısında toplanır)
        const missing = [...new Set(raw.flatMap(([, list]) => list.map(Number)))].filter((k) => !agentCache.has(k));
        const got = await Promise.all(missing.map((k) => read<any>("getAgent", [BigInt(k)])));
        got.forEach((x, i) => agentCache.set(missing[i], { ...x, matches: Number(x.matches), wins: Number(x.wins) } as Agent));
        // bahis dağılımı yalnızca bitmemiş maçlar için okunur (oran göstermek için)
        const stakes = await Promise.all(
          raw.map(([m, list], i) =>
            Number(m.phase) === 3
              ? Promise.resolve([] as bigint[])
              : Promise.all(list.map((_, s) => read<bigint>("stakeOnSlot", [BigInt(ids[i]), s]))),
          ),
        );
        const next = raw.map(([m, list], i) => ({
            id: ids[i],
            phase: Number(m.phase),
            round: Number(m.round),
            maxRounds: Number(m.maxRounds),
            bettingEnd: Number(m.bettingEnd),
            winnerSlot: Number(m.winnerSlot),
            pool: m.pool,
            agentIds: list.map(Number),
            agents: list.map((a) => agentCache.get(Number(a))!),
            stakes: stakes[i],
          }));
        lastCards = next;
        lastCount = n;
        setCount(n);
        setCards(next);
        setError(null);
      } catch (e: any) {
        setError(e?.shortMessage ?? "Zincire ulaşılamadı");
      } finally {
        busy.current = false;
      }
    };
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [limit]);

  return { cards, count, error };
}
