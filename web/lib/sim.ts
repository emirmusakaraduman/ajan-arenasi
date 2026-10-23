import { MAX_HP } from "./arena";
import { replayRound, type Move, type RoundLog } from "./replay";
import type { Agent, MatchView } from "./useMatch";

export type Spec = { name: string; persona: string; strategy: string };

/** Kişilik ve strateji metninden eğilimler çıkarır: ajan beyni olmadan hızlı önizleme için. */
export function traits(text: string) {
  const t = text.toLocaleLowerCase("tr-TR");
  const count = (words: string[]) => words.reduce((n, w) => n + (t.includes(w) ? 1 : 0), 0);
  return {
    aggr: count(["saldır", "vur", "acımasız", "agresif", "sabırsız", "öldür", "güçlü", "kavgac"]),
    defn: count(["savun", "bekle", "temkinli", "sakin", "korun", "kaçın", "sağ kal", "dayan"]),
    dipl: count(["ittifak", "güven", "anlaş", "diplomat", "dost", "tatlı", "barış", "yardım"]),
    treach: count(["ihanet", "kandır", "sinsi", "hile", "kurnaz", "blöf", "sırtından", "aldat"]),
  };
}

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
};
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** Zincir dışı antrenman maçı: Arena.sol kurallarının aynısı, hamleleri eğilimlere göre seçilir. */
export function simulate(specs: Spec[], maxRounds = 8, tryNo = 0): { logs: RoundLog[]; hp: number[]; winner: number } {
  const n = specs.length;
  const rand = rng(hash(specs.map((s) => s.name + s.persona + s.strategy).join("|")) + tryNo * 7919);
  const tr = specs.map((s) => traits(`${s.persona} ${s.strategy}`));
  let hp = new Array(n).fill(MAX_HP);
  const ally: (number | null)[] = new Array(n).fill(null);
  const logs: RoundLog[] = [];

  for (let r = 0; r < maxRounds; r++) {
    const moves: Move[] = Array.from({ length: n }, () => ({ action: 0, target: 0, submitted: false }));
    for (let i = 0; i < n; i++) {
      if (hp[i] === 0) continue;
      const others = [...Array(n).keys()].filter((j) => j !== i && hp[j] > 0);
      if (others.length === 0) { moves[i] = { action: 0, target: i, submitted: true }; continue; }
      const t = tr[i];
      const w = [1 + t.defn * 1.2 + (hp[i] <= 3 ? 2 : 0), 1 + t.aggr * 1.2, 0.6 + t.dipl * 1.2 + t.treach * 0.4];
      let x = rand() * (w[0] + w[1] + w[2]);
      const action = x < w[0] ? 0 : x < w[0] + w[1] ? 1 : 2;
      const weakest = others.reduce((a, b) => (hp[b] < hp[a] ? b : a));
      const friend = ally[i] !== null && hp[ally[i]!] > 0 ? ally[i]! : null;
      let target = others[Math.floor(rand() * others.length)];
      if (action === 1) target = friend !== null && t.treach > 0 && rand() < 0.55 ? friend : rand() < 0.6 ? weakest : target;
      if (action === 2) target = friend ?? target;
      moves[i] = { action, target: action === 0 ? i : target, submitted: true };
    }
    const res = replayRound(hp, moves);
    // karşılıklı ittifakı hatırla
    for (let i = 0; i < n; i++) {
      const m = moves[i];
      ally[i] = m.submitted && m.action === 2 && moves[m.target]?.action === 2 && moves[m.target].target === i ? m.target : ally[i];
    }
    hp = res.hp;
    logs.push({ round: r, moves, hpAfter: res.hp, events: res.events });
    if (hp.filter((h) => h > 0).length <= 1) break;
  }
  const winner = hp.reduce((best, h, i) => (h > hp[best] ? i : best), 0);
  return { logs, hp, winner };
}

/** Antrenman sonucunu sahne bileşenlerinin okuduğu maç görünümüne çevirir. */
export function syntheticView(specs: Spec[], logs: RoundLog[], hp: number[], winner: number): MatchView {
  const agents: Agent[] = specs.map((s) => ({ owner: "", operator: "", name: s.name, persona: s.persona, strategy: s.strategy, matches: 0, wins: 0 }));
  const zero = specs.map(() => BigInt(0));
  return {
    id: 0, count: 0, agentIds: specs.map(() => 0),
    match: { phase: 3, bettingEnd: 0, round: logs.length, maxRounds: Math.max(logs.length, 1), commitDeadline: 0, revealDeadline: 0, winnerSlot: winner, pool: BigInt(0), fee: BigInt(0) },
    agents, hp, stakes: zero, history: logs, messages: logs.map(() => []), live: [],
    commits: specs.map(() => false), revealed: [], myBets: zero, claimed: false, flags: 0, charges: specs.map(() => null),
  };
}
