import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Ajan hafızası: bir ajan yeni maça girerken önceki maçlardan öğrendiklerini bilir (kim ihanet etti, kiminle ittifak işe yaradı).
 * Oyun dengesini değiştirmez; yalnızca ajanın karar isteminde ek bağlam olarak kullanılır.
 * Zincirdeki sayaçlar (Arena.getStats) kalıcı istatistiktir; bu dosya ise ajanın "anıları"dır ve runner makinesinde tutulur.
 */

export type Mv = { action: number; target: number; submitted: boolean };
export type Lessons = Record<number, string[]>; // slot -> cümleler
/** Ajanın rakip adına göre biriktirdiği olgular: yedek beyin kararında bunları kullanır */
export type Facts = {
  grudges: Record<string, number>; // ad -> bana kaç kez ihanet etti
  friends: Record<string, number>; // ad -> kaç tur karşılıklı ittifak kurduk
  thieves: Record<string, number>; // ad -> benden kaç kez can çaldı
};
export const emptyFacts = (): Facts => ({ grudges: {}, friends: {}, thieves: {} });

const DEFEND = 0, ATTACK = 1, ALLY = 2, STEAL = 3, CHARGE = 4, PACT = 5;

/**
 * Bir maçın hamle geçmişinden her ajan için ders cümleleri çıkarır.
 * `rounds[r][slot]` zincirdeki getMove sonucudur. Kurallar Arena.sol ile aynıdır (ihanet, ağır saldırı, pakt).
 */
export function analyzeMatch(names: string[], rounds: Mv[][], winnerSlot: number, finalHp: number[], matchId: number): Lessons {
  return analyze(names, rounds, winnerSlot, finalHp, matchId).lessons;
}

/** Ders cümleleri ve yapılandırılmış olgular (slot başına) */
export function analyze(names: string[], rounds: Mv[][], winnerSlot: number, finalHp: number[], matchId: number): { lessons: Lessons; facts: Record<number, Facts> } {
  const n = names.length;
  const betrayedBy = Array.from({ length: n }, () => new Array<number>(n).fill(0)); // [mağdur][ihanet eden]
  const allied = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const stolenBy = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const hp = new Array(n).fill(10);
  let charged: (number | null)[] = new Array(n).fill(null);

  for (const moves of rounds) {
    const heavy = charged.map((c) => c !== null);
    const act = moves.map((m, i) => (heavy[i] ? ATTACK : m?.submitted ? m.action : -1));
    const tgt = moves.map((m, i) => (heavy[i] ? (charged[i] as number) : m?.target ?? i));
    const pactOn = moves.filter((m, i) => !heavy[i] && m?.submitted && m.action === PACT).length >= 3;
    const defends = (t: number) => !heavy[t] && (act[t] === DEFEND || (act[t] === PACT && !pactOn));
    const offers = (t: number, i: number) => !heavy[t] && ((act[t] === ALLY && tgt[t] === i) || (pactOn && act[t] === PACT));

    for (let i = 0; i < n; i++) {
      const t = tgt[i];
      if (act[i] === ATTACK && hp[i] > 0 && hp[t] > 0 && (heavy[i] || !defends(t)) && offers(t, i)) betrayedBy[t][i]++;
      if (act[i] === ALLY && hp[i] > 0 && hp[t] > 0 && !heavy[t] && act[t] === ALLY && tgt[t] === i && i < t) { allied[i][t]++; allied[t][i]++; }
      if (act[i] === STEAL && hp[t] > 0 && !defends(t)) stolenBy[t][i]++;
    }
    // sonraki turun hazırlığı
    charged = charged.map((_, i) => (!heavy[i] && act[i] === CHARGE ? tgt[i] : null));
    // can izi yalnızca "ölü ajan" ayrımı için: kaba bir takip yeterli (zincirdeki son durum finalHp'dir)
    // Ölü ajanların hamlesi zaten submitted=false gelir, bu yüzden ayrıca hp düşürmeye gerek yok.
  }

  const out: Lessons = {};
  const facts: Record<number, Facts> = {};
  for (let a = 0; a < n; a++) {
    const lines: string[] = [];
    const f = emptyFacts();
    for (let b = 0; b < n; b++) {
      if (b === a) continue;
      if (betrayedBy[a][b]) f.grudges[names[b]] = betrayedBy[a][b];
      if (allied[a][b]) f.friends[names[b]] = allied[a][b];
      if (stolenBy[a][b]) f.thieves[names[b]] = stolenBy[a][b];
    }
    facts[a] = f;
    lines.push(
      winnerSlot === a
        ? `Maç #${matchId}: kazandın (${finalHp[a]} can kaldı).`
        : `Maç #${matchId}: kaybettin, kazanan ${names[winnerSlot]} oldu.`,
    );
    for (let b = 0; b < n; b++) {
      if (b === a) continue;
      if (betrayedBy[a][b]) lines.push(`${names[b]} sana ${betrayedBy[a][b]} kez ihanet etti, ittifak teklif ederken saldırdı. Ona güvenme.`);
      if (betrayedBy[b][a]) lines.push(`${names[b]} ajanına ${betrayedBy[b][a]} kez ihanet ettin; seni hatırlıyor olabilir.`);
      if (allied[a][b]) lines.push(`${names[b]} ile ${allied[a][b]} tur karşılıklı ittifak kurdun, güvenilir çıktı.`);
      if (stolenBy[a][b]) lines.push(`${names[b]} senden ${stolenBy[a][b]} kez can çaldı; savunmasız kalma.`);
    }
    out[a] = lines;
  }
  return { lessons: out, facts };
}

// ---------------------------------------------------------------- kalıcı depo

export type Memory = { agents: Record<string, { lessons: string[]; wins: number; losses: number; facts?: Facts }>; done: number[] };
const MAX_LESSONS = 12; // ajan başına saklanan en son ders sayısı
const PROMPT_LESSONS = 6; // isteme eklenen en son ders sayısı

export class MemoryStore {
  private data: Memory;
  constructor(private file: string) {
    this.data = { agents: {}, done: [] };
    try {
      if (existsSync(file)) this.data = { ...this.data, ...JSON.parse(readFileSync(file, "utf8")) };
    } catch {
      // bozuk dosya hafızayı sıfırlar, süreci düşürmez
    }
  }

  /** Aynı maç iki kez işlenmesin (süreç yeniden başlayınca) */
  has(matchId: number) {
    return this.data.done.includes(matchId);
  }

  record(matchId: number, agentId: number, lines: string[], won: boolean, facts?: Facts) {
    const a = (this.data.agents[agentId] ??= { lessons: [], wins: 0, losses: 0 });
    a.lessons = [...a.lessons, ...lines].slice(-MAX_LESSONS);
    if (won) a.wins++; else a.losses++;
    if (facts) {
      const acc = (a.facts ??= emptyFacts());
      for (const key of ["grudges", "friends", "thieves"] as const) {
        for (const [name, n] of Object.entries(facts[key])) acc[key][name] = (acc[key][name] ?? 0) + n;
      }
    }
  }

  /** Yedek beynin kullandığı yapılandırılmış olgular (rakip adına göre) */
  facts(agentId: number): Facts {
    return this.data.agents[agentId]?.facts ?? emptyFacts();
  }

  finish(matchId: number) {
    if (!this.data.done.includes(matchId)) this.data.done.push(matchId);
    this.data.done = this.data.done.slice(-500);
    this.save();
  }

  /** Karar istemine eklenecek hafıza cümleleri */
  lines(agentId: number): string[] {
    const a = this.data.agents[agentId];
    if (!a) return [];
    const head = a.wins + a.losses > 0 ? [`Geçmişin: ${a.wins} galibiyet, ${a.losses} mağlubiyet.`] : [];
    return [...head, ...a.lessons.slice(-PROMPT_LESSONS)];
  }

  private save() {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data));
    renameSync(tmp, this.file); // yarım yazılmış dosya kalmasın
  }
}
