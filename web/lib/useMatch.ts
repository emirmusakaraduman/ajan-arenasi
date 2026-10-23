"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { read, ARENA_ADDRESS } from "./arena";
import { replayAll, type ArenaEvent, type Move, type RoundLog } from "./replay";

export type Agent = { owner: string; operator: string; name: string; persona: string; strategy: string; matches: number; wins: number };
export type MatchInfo = {
  phase: number; bettingEnd: number; round: number; maxRounds: number; commitDeadline: number;
  revealDeadline: number; winnerSlot: number; pool: bigint; fee: bigint;
};
export type Msg = { slot: number; text: string };
export type MatchView = {
  id: number; count: number; match: MatchInfo; agents: Agent[]; agentIds: number[]; hp: number[]; stakes: bigint[];
  history: RoundLog[]; messages: Msg[][]; live: Msg[]; commits: boolean[]; revealed: Move[]; myBets: bigint[]; claimed: boolean;
  /** maç bayrakları (FLAG_ADVANCED, FLAG_EVENTS); eski kontratta 0 */
  flags: number;
  /** şu an ağır saldırı hazırlayan ajanların hedefi (slot), yoksa null */
  charges: (number | null)[];
};

const EMPTY: Move = { action: 0, target: 0, submitted: false };

/** Seçili maçı 2 sn'de bir okur. Biten turlar değişmez olduğu için bir kez çekilip saklanır. */
export function useMatch(requested: number | null, user: string | null) {
  const [view, setView] = useState<MatchView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rounds = useRef(new Map<string, Move[]>());
  const said = useRef(new Map<string, Msg[]>());
  const flagsRef = useRef(new Map<number, number>()); // bayraklar maç boyunca değişmez
  const arenaEv = useRef(new Map<string, ArenaEvent>());
  const agentsRef = useRef<{ key: string; list: Agent[] }>({ key: "", list: [] });
  const busy = useRef(false);

  const load = useCallback(async () => {
    if (!ARENA_ADDRESS || busy.current) return; // yavaş yanıtlarda yoklamalar üst üste binmesin
    busy.current = true;
    try {
      const count = Number(await read<bigint>("matchCount"));
      if (count === 0) { setView(null); return; }
      const id = requested && requested <= count ? requested : count;
      const [m, ids, hpRaw] = await Promise.all([read<any>("getMatch", [BigInt(id)]), read<bigint[]>("getMatchAgents", [BigInt(id)]), read<number[]>("getHp", [BigInt(id)])]);
      const n = ids.length;
      const match: MatchInfo = {
        phase: Number(m.phase), bettingEnd: Number(m.bettingEnd), round: Number(m.round), maxRounds: Number(m.maxRounds),
        commitDeadline: Number(m.commitDeadline), revealDeadline: Number(m.revealDeadline), winnerSlot: Number(m.winnerSlot), pool: m.pool, fee: m.fee,
      };

      // Maç bayrakları değişmez: bir kez okunur. Eski kontratta bu fonksiyon yoktur, 0 sayılır.
      if (!flagsRef.current.has(id)) flagsRef.current.set(id, await read<number>("matchFlags", [BigInt(id)]).then(Number).catch(() => 0));
      const flags = flagsRef.current.get(id)!;

      // Ajan bilgisi (galibiyet sayısı dahil) maç evresi değişince yenilenir
      const key = `${id}:${match.phase}`;
      if (agentsRef.current.key !== key) {
        const list = await Promise.all(ids.map((a) => read<any>("getAgent", [a]).then((x) => ({ ...x, matches: Number(x.matches), wins: Number(x.wins) }) as Agent)));
        agentsRef.current = { key, list };
      }

      const stakes = await Promise.all(ids.map((_, s) => read<bigint>("stakeOnSlot", [BigInt(id), s])));

      // Biten turların hamleleri
      const done: Move[][] = [];
      const doneMsgs: Msg[][] = [];
      const fetchMsgs = (r: number) =>
        read<any[]>("getMessages", [BigInt(id), r])
          .then((l) => l.map((x) => ({ slot: Number(x.slot), text: x.text as string })))
          .catch(() => [] as Msg[]); // mesaj özelliği olmayan eski kontratlarda boş say
      // Eksik turları tek seferde, paralel çek (ilk açılış hızlı olsun)
      await Promise.all(
        Array.from({ length: match.round }, (_, r) => r).map(async (r) => {
          const ck = `${id}:${r}`;
          if (!rounds.current.has(ck)) {
            const mv = await Promise.all(ids.map((_, s) => read<any>("getMove", [BigInt(id), r, s]).then((x) => ({ action: Number(x.action), target: Number(x.target), submitted: x.submitted }))));
            rounds.current.set(ck, mv);
          }
          if (!said.current.has(ck)) said.current.set(ck, await fetchMsgs(r));
          if (flags & 2 && !arenaEv.current.has(ck)) {
            const ev = await read<[number, number]>("getArenaEvent", [BigInt(id), r]).then(([kind, slot]) => (Number(kind) ? { kind: Number(kind), slot: Number(slot) } : null)).catch(() => null);
            arenaEv.current.set(ck, ev);
          }
        }),
      );
      for (let r = 0; r < match.round; r++) {
        done.push(rounds.current.get(`${id}:${r}`)!);
        doneMsgs.push(said.current.get(`${id}:${r}`)!);
      }

      // Süren turun kilitli ve açılmış hamleleri
      let live: Msg[] = [];
      let commits: boolean[] = new Array(n).fill(false);
      let revealed: Move[] = new Array(n).fill(EMPTY);
      if (match.phase === 2) {
        const cur = match.round;
        live = await fetchMsgs(cur);
        commits = await Promise.all(ids.map((_, s) => read<string>("getCommit", [BigInt(id), cur, s]).then((h) => !/^0x0+$/.test(h))));
        revealed = await Promise.all(ids.map((_, s) => read<any>("getMove", [BigInt(id), cur, s]).then((x) => ({ action: Number(x.action), target: Number(x.target), submitted: x.submitted }))));
      }

      // Ağır saldırı hazırlayan ajanlar (yalnızca gelişmiş maçlarda)
      let charges: (number | null)[] = new Array(n).fill(null);
      if (flags & 1 && match.phase === 2) {
        charges = await Promise.all(ids.map((_, s) => read<number>("getCharge", [BigInt(id), s]).then((v) => (Number(v) ? Number(v) - 1 : null)).catch(() => null)));
      }

      let myBets: bigint[] = new Array(n).fill(BigInt(0));
      let claimed = false;
      if (user) {
        myBets = await Promise.all(ids.map((_, s) => read<bigint>("betOf", [BigInt(id), user, s])));
        claimed = await read<boolean>("claimed", [BigInt(id), user]);
      }

      setView({ id, count, match, agents: agentsRef.current.list, agentIds: ids.map(Number), hp: hpRaw.map(Number), stakes, history: replayAll(n, done, done.map((_, r) => arenaEv.current.get(`${id}:${r}`) ?? null)), messages: doneMsgs, live, commits, revealed, myBets, claimed, flags, charges });
      setError(null);
    } catch (e: any) {
      setError(e?.shortMessage ?? "Zincire ulaşılamadı");
    } finally {
      busy.current = false;
    }
  }, [requested, user]);

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  return { view, error, reload: load };
}
