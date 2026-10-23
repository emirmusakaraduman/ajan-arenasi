import type { RoundLog } from "./replay";

export type AgentSummary = {
  slot: number;
  /** verdiği hasar (saldırı, ihanet, çalma) */
  dealt: number;
  /** aldığı hasar (rakipten ve arena tuzaklarından) */
  taken: number;
  betrayals: number; // ihanet etti
  betrayed: number;  // ihanete uğradı
  alliances: number;
  steals: number;
  heavy: number;     // ağır saldırı sayısı
  /** elendiği tur (1'den), elenmediyse null */
  outRound: number | null;
};

export type Awards = {
  topDamage: { slot: number; value: number } | null;
  bigBetrayal: { from: number; to: number; round: number; dmg: number } | null;
  topThief: { slot: number; value: number } | null;
  firstOut: { slot: number; round: number } | null;
  mostAllies: { slot: number; value: number } | null;
};

/** Biten turların olaylarından ajan başına istatistik ve ödüller çıkarır (zincirden ek okuma gerekmez). */
export function summarize(history: RoundLog[], slots: number): { agents: AgentSummary[]; awards: Awards } {
  const agents: AgentSummary[] = Array.from({ length: slots }, (_, slot) => ({
    slot, dealt: 0, taken: 0, betrayals: 0, betrayed: 0, alliances: 0, steals: 0, heavy: 0, outRound: null,
  }));
  let bigBetrayal: Awards["bigBetrayal"] = null;
  let firstOut: Awards["firstOut"] = null;

  for (const log of history) {
    for (const e of log.events) {
      const a = agents[e.from];
      const t = e.to !== undefined ? agents[e.to] : undefined;
      if (e.kind === "attack" || e.kind === "betrayal") {
        if (a && t && e.dmg) { a.dealt += e.dmg; t.taken += e.dmg; }
        if (e.heavy && a) a.heavy++;
        if (e.kind === "betrayal" && a && t) {
          a.betrayals++; t.betrayed++;
          if (!bigBetrayal || (e.dmg ?? 0) > bigBetrayal.dmg) bigBetrayal = { from: e.from, to: e.to!, round: log.round + 1, dmg: e.dmg ?? 0 };
        }
      } else if (e.kind === "steal" && a && t) {
        a.steals++; a.dealt += e.dmg ?? 1; t.taken += e.dmg ?? 1;
      } else if (e.kind === "alliance" && a && t) {
        a.alliances++; t.alliances++;
      } else if (e.kind === "trap" && a) {
        a.taken += 1;
      } else if (e.kind === "eliminated" && a) {
        a.outRound = log.round + 1;
        if (!firstOut) firstOut = { slot: e.from, round: log.round + 1 };
      }
    }
  }

  const best = (f: (a: AgentSummary) => number) => {
    const top = agents.reduce((m, a) => (f(a) > f(m) ? a : m), agents[0]);
    return top && f(top) > 0 ? { slot: top.slot, value: f(top) } : null;
  };
  return {
    agents,
    awards: { topDamage: best((a) => a.dealt), bigBetrayal, topThief: best((a) => a.steals), firstOut, mostAllies: best((a) => a.alliances) },
  };
}
