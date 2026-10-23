/** Arena.sol MAX_HP ile aynı. Bu dosya bilerek bağımsızdır (viem içermez): kontrat testleri de içe aktarır. */
const MAX_HP = 10;

export type Move = { action: number; target: number; submitted: boolean };
export type EvKind =
  | "attack" | "blocked" | "betrayal" | "alliance" | "offer" | "defend" | "idle" | "eliminated"
  | "steal" | "charge" | "pact" | "trap" | "spring";
export type Ev = { kind: EvKind; from: number; to?: number; dmg?: number; heavy?: boolean };
export type RoundLog = { round: number; moves: Move[]; hpAfter: number[]; events: Ev[]; charged?: (number | null)[] };
/** Tur sonunda gerçekleşen arena olayı (kontrattaki getArenaEvent): 1 = tuzak, 2 = şifa pınarı */
export type ArenaEvent = { kind: number; slot: number } | null;

export const ACTION = { Defend: 0, Attack: 1, Ally: 2, Steal: 3, Charge: 4, Pact: 5 } as const;
/** Arayüzde ve ajan komutlarında kullanılan Türkçe hamle adları */
export const ACTION_NAMES = ["savun", "saldır", "ittifak", "çal", "güç topla", "pakt"] as const;

const ATTACK_DMG = 2, BETRAYAL_DMG = 4, ALLY_HEAL = 1;
const STEAL_AMOUNT = 1, CHARGE_DMG = 4, CHARGE_PIERCE = 1, PACT_MIN = 3, PACT_HEAL = 1;

/** Arena.sol'daki resolveRound kurallarının birebir kopyası; olayları yalnızca anlatım için üretir.
 *  `charged[i]`: i'nin bu tur kendiliğinden vuracağı hedef (önceki turda Charge seçti), yoksa null. */
export function replayRound(
  hp: number[],
  moves: Move[],
  charged: (number | null)[] = [],
  arena: ArenaEvent = null,
): { hp: number[]; events: Ev[]; charged: (number | null)[] } {
  const n = hp.length;
  const dmg = new Array(n).fill(0);
  const heal = new Array(n).fill(0);
  const events: Ev[] = [];
  const has = new Array(n).fill(false);
  const heavy = new Array(n).fill(false);
  const act = new Array(n).fill(0);
  const tgt = new Array(n).fill(0);

  let pacts = 0;
  for (let i = 0; i < n; i++) {
    if (hp[i] === 0) continue;
    const ch = charged[i];
    if (ch !== null && ch !== undefined) {
      has[i] = true; heavy[i] = true; act[i] = ACTION.Attack; tgt[i] = ch;
    } else if (moves[i]?.submitted) {
      has[i] = true; act[i] = moves[i].action; tgt[i] = moves[i].target;
      if (act[i] === ACTION.Pact) pacts++;
    }
  }
  const pactOn = pacts >= PACT_MIN;
  const def = act.map((a, i) => has[i] && !heavy[i] && (a === ACTION.Defend || (a === ACTION.Pact && !pactOn)));
  /** t, i'ye ittifak (ya da geçerli pakt ile herkese) teklif ediyor muydu? */
  const offers = (t: number, i: number) =>
    has[t] && !heavy[t] && ((act[t] === ACTION.Ally && tgt[t] === i) || (pactOn && act[t] === ACTION.Pact));

  for (let i = 0; i < n; i++) {
    if (hp[i] === 0) continue;
    if (!has[i]) { events.push({ kind: "idle", from: i }); continue; }
    const a = act[i];
    if (a === ACTION.Pact) {
      if (pactOn) { heal[i] += PACT_HEAL; events.push({ kind: "pact", from: i }); }
      else events.push({ kind: "defend", from: i });
      continue;
    }
    if (a === ACTION.Defend) { events.push({ kind: "defend", from: i }); continue; }
    if (a === ACTION.Charge) { events.push({ kind: "charge", from: i, to: tgt[i] }); continue; }
    const t = tgt[i];
    if (hp[t] === 0) continue;
    if (a === ACTION.Ally) {
      if (has[t] && !heavy[t] && act[t] === ACTION.Ally && tgt[t] === i) {
        heal[i] += ALLY_HEAL;
        if (i < t) events.push({ kind: "alliance", from: i, to: t });
      } else if (!(has[t] && act[t] === ACTION.Attack && tgt[t] === i)) {
        events.push({ kind: "offer", from: i, to: t });
      }
    } else if (a === ACTION.Steal) {
      if (def[t]) { events.push({ kind: "blocked", from: i, to: t }); continue; }
      dmg[t] += STEAL_AMOUNT; heal[i] += STEAL_AMOUNT;
      events.push({ kind: "steal", from: i, to: t, dmg: STEAL_AMOUNT });
    } else {
      const betrayed = offers(t, i);
      let d: number;
      if (heavy[i]) d = betrayed ? BETRAYAL_DMG + 2 : def[t] ? CHARGE_PIERCE : CHARGE_DMG;
      else if (def[t]) { events.push({ kind: "blocked", from: i, to: t }); continue; }
      else d = betrayed ? BETRAYAL_DMG : ATTACK_DMG;
      dmg[t] += d;
      events.push({ kind: betrayed ? "betrayal" : "attack", from: i, to: t, dmg: d, heavy: heavy[i] || undefined });
    }
  }

  const next = hp.map((h, i) => {
    if (h === 0) return 0;
    let r = Math.max(h - dmg[i], 0);
    if (r > 0) r = Math.min(r + heal[i], MAX_HP);
    return r;
  });
  next.forEach((h, i) => { if (hp[i] > 0 && h === 0) events.push({ kind: "eliminated", from: i }); });

  // Arena olayı turun en sonunda uygulanır (zincirde yalnızca gerçekten etkili olanlar kaydedilir)
  if (arena && arena.kind === 1 && next[arena.slot] > 1) { next[arena.slot] -= 1; events.push({ kind: "trap", from: arena.slot }); }
  else if (arena && arena.kind === 2 && next[arena.slot] > 0 && next[arena.slot] < MAX_HP) { next[arena.slot] += 1; events.push({ kind: "spring", from: arena.slot }); }

  // Bir sonraki tur için ağır saldırı hazırlığı
  const nextCharged: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (has[i] && !heavy[i] && act[i] === ACTION.Charge && next[i] > 0) nextCharged[i] = tgt[i];
  }
  return { hp: next, events, charged: nextCharged };
}

/** Tamamlanan turların hamlelerinden can geçmişini ve anlatımı çıkarır. */
export function replayAll(slots: number, rounds: Move[][], arenaEvents: ArenaEvent[] = []): RoundLog[] {
  let hp = new Array(slots).fill(MAX_HP);
  let charged: (number | null)[] = new Array(slots).fill(null);
  return rounds.map((moves, round) => {
    const r = replayRound(hp, moves, charged, arenaEvents[round] ?? null);
    const log: RoundLog = { round, moves, hpAfter: r.hp, events: r.events, charged };
    hp = r.hp;
    charged = r.charged;
    return log;
  });
}
