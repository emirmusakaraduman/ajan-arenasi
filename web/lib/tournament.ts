"use client";

import { useEffect, useRef, useState } from "react";
import { parseAbi } from "viem";
import { publicClient, read } from "./arena";
import type { Agent } from "./useMatch";
import { shortMsg, toAgent, type RawAgent, type RawMatch, type RawTournament } from "./rawTypes";

/** Turnuva kontratı (Tournament.sol). Tanımlı değilse turnuva sayfaları bilgi mesajı gösterir. */
export const TOURNAMENT_ADDRESS = (process.env.NEXT_PUBLIC_TOURNAMENT_ADDRESS ?? "") as `0x${string}`;

export const tournamentAbi = parseAbi([
  "function tournamentCount() view returns (uint256)",
  "function getTournament(uint256) view returns ((address creator,uint8 size,uint8 round,uint8 rounds,uint32 bettingSeconds,uint32 roundSeconds,uint8 maxRounds,uint8 flags,uint256 champion))",
  "function getEntrants(uint256) view returns (uint256[])",
  "function getRoundPlayers(uint256,uint8) view returns (uint256[])",
  "function getRoundMatches(uint256,uint8) view returns (uint256[])",
  "function createTournament(uint256[] agentIds,uint32 bettingSeconds,uint32 roundSeconds,uint8 maxRounds,uint8 flags) returns (uint256)",
  "function advance(uint256 tid)",
]);

export const tread = <T = unknown>(fn: string, args: unknown[] = []) =>
  publicClient.readContract({ address: TOURNAMENT_ADDRESS, abi: tournamentAbi, functionName: fn as never, args: args as never }) as Promise<T>;

/** Cüzdan göndericisine verilen hedef: Arena yerine turnuva kontratı */
export const tournamentTarget = { address: TOURNAMENT_ADDRESS, abi: tournamentAbi } as const;

export type BracketMatch = {
  id: number; phase: number; winnerSlot: number; agentIds: number[]; pool: bigint;
  /** canlı maçta ajanların canı (slot sırasıyla); diğer evrelerde boş */
  hp: number[];
};
export type Bracket = {
  id: number; creator: string; size: number; round: number; rounds: number; flags: number; champion: number;
  /** rounds[r]: o turun maçları; henüz açılmamış turlar boş dizidir */
  matches: BracketMatch[][];
  agents: Map<number, Agent>;
  /** mevcut turun tüm maçları bitti mi (sonraki turu açmak için) */
  roundDone: boolean;
};

const agentCache = new Map<number, Agent>();
const getAgent = async (id: number) => {
  const hit = agentCache.get(id);
  if (hit) return hit;
  const a: Agent = toAgent(await read<RawAgent>("getAgent", [BigInt(id)]));
  agentCache.set(id, a);
  return a;
};

/** Bir turnuvanın ağacını okur ve 5 sn'de bir yeniler. */
export function useBracket(tid: number) {
  const [bracket, setBracket] = useState<Bracket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const reload = useRef<() => void>(() => {});

  useEffect(() => {
    if (!TOURNAMENT_ADDRESS) return;
    let stop = false;
    const load = async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        const count = Number(await tread<bigint>("tournamentCount"));
        if (tid > count) { if (!stop) setError("Böyle bir turnuva yok"); return; }
        const t = await tread<RawTournament>("getTournament", [BigInt(tid)]);
        const round = Number(t.round);
        const rounds = Number(t.rounds);
        const matches: BracketMatch[][] = [];
        const need = new Set<number>(); // ad gösterilecek ajanlar
        for (let r = 0; r < rounds; r++) {
          if (r > round) { matches.push([]); continue; }
          const ids = await tread<bigint[]>("getRoundMatches", [BigInt(tid), r]);
          const row = await Promise.all(
            ids.map(async (mid) => {
              const [m, ag] = await Promise.all([read<RawMatch>("getMatch", [mid]), read<bigint[]>("getMatchAgents", [mid])]);
              ag.forEach((a) => need.add(Number(a)));
              const hp = Number(m.phase) === 2 ? (await read<number[]>("getHp", [mid])).map(Number) : [];
              return { id: Number(mid), phase: Number(m.phase), winnerSlot: Number(m.winnerSlot), agentIds: ag.map(Number), pool: m.pool as bigint, hp };
            }),
          );
          matches.push(row);
        }
        const entrants = await tread<bigint[]>("getEntrants", [BigInt(tid)]);
        entrants.forEach((a) => need.add(Number(a)));
        await Promise.all([...need].map(getAgent));
        const agents = new Map([...need].map((id) => [id, agentCache.get(id)!]));
        const champion = Number(t.champion);
        const cur = matches[round] ?? [];
        if (!stop) {
          setBracket({
            id: tid, creator: t.creator, size: Number(t.size), round, rounds, flags: Number(t.flags), champion, matches, agents,
            roundDone: champion === 0 && cur.length > 0 && cur.every((m) => m.phase === 3),
          });
          setError(null);
        }
      } catch (e) {
        if (!stop) setError(shortMsg(e));
      } finally {
        busy.current = false;
      }
    };
    reload.current = load;
    load();
    const t = setInterval(load, 5000);
    return () => { stop = true; clearInterval(t); };
  }, [tid]);

  return { bracket, error, reload: () => reload.current() };
}

/** Turnuva listesi: en yeniden eskiye, en fazla `limit` adet */
export function useTournamentList(limit = 12) {
  const [list, setList] = useState<{ id: number; size: number; round: number; rounds: number; champion: number; championName: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!TOURNAMENT_ADDRESS) return;
    let stop = false;
    const load = async () => {
      try {
        const n = Number(await tread<bigint>("tournamentCount"));
        const ids = Array.from({ length: Math.min(n, limit) }, (_, i) => n - i);
        const rows = await Promise.all(
          ids.map(async (id) => {
            const t = await tread<RawTournament>("getTournament", [BigInt(id)]);
            const champion = Number(t.champion);
            return { id, size: Number(t.size), round: Number(t.round), rounds: Number(t.rounds), champion, championName: champion ? (await getAgent(champion)).name : "" };
          }),
        );
        if (!stop) { setList(rows); setError(null); }
      } catch (e) {
        if (!stop) setError(shortMsg(e));
      }
    };
    load();
    const t = setInterval(load, 8000);
    return () => { stop = true; clearInterval(t); };
  }, [limit]);
  return { list, error };
}
