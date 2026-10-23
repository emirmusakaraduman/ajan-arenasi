import { FEE_BPS } from "./arena";

/** Kazanırsa 1 MON'a karşılık gelen toplam getiri (komisyon düşülmüş). Kimse tutmadıysa null. */
export function multiplier(pool: bigint, stake: bigint): number | null {
  if (stake <= BigInt(0)) return null;
  return Number((pool * BigInt(10000 - FEE_BPS)) / stake) / 10000;
}

/** Çarpanı "x2,4" biçiminde yazar */
export const fmtMult = (v: number) => `x${v.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}`;

/** En çok bahis alan (en düşük çarpanlı) ajanın slotu; bahis yoksa -1 */
export function favoriteSlot(stakes: bigint[]): number {
  let best = -1;
  stakes.forEach((s, i) => { if (s > BigInt(0) && (best < 0 || s > stakes[best])) best = i; });
  return best;
}
