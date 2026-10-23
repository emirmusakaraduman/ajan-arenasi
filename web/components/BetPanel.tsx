"use client";

import Link from "next/link";
import { useState } from "react";
import { parseEther } from "viem";
import { FEE_BPS, fmt } from "@/lib/arena";
import { favoriteSlot, fmtMult, multiplier } from "@/lib/odds";
import { slotColor } from "@/lib/playback";
import type { MatchView } from "@/lib/useMatch";
import { Fighter } from "./Fighter";

type Props = {
  view: MatchView;
  now: number;
  connected: boolean;
  busy: boolean;
  onBet: (slot: number, amount: bigint) => void;
};

const CHIPS = ["0.1", "0.5", "1"];

/** Havuzun ajanlara dağılımı: halka grafik. Bahis yoksa boş halka. */
export function PoolDonut({ stakes, size = 88 }: { stakes: bigint[]; size?: number }) {
  const total = stakes.reduce((a, b) => a + b, BigInt(0));
  const r = 36, c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label="Bahis dağılımı" className="shrink-0 -rotate-90">
      <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,.15)" strokeWidth="14" />
      {total > BigInt(0) &&
        stakes.map((s, i) => {
          const len = (Number((s * BigInt(10000)) / total) / 10000) * c;
          const el = <circle key={i} cx="50" cy="50" r={r} fill="none" stroke={slotColor(i, 58)} strokeWidth="14" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} />;
          offset += len;
          return el;
        })}
    </svg>
  );
}

/** Kazanan bahisçiye çıkan ödeme paneli. Sekmeden bağımsız, her zaman görünür olsun diye ayrıdır. */
export function ClaimBanner({ view, busy, onClaim }: { view: MatchView; busy: boolean; onClaim: () => void }) {
  const { match, stakes, myBets } = view;
  if (match.phase !== 3) return null;
  const winStake = stakes[match.winnerSlot];
  const myTotal = myBets.reduce((a, b) => a + b, BigInt(0));
  const payout = winStake === BigInt(0) ? myTotal : (myBets[match.winnerSlot] * (match.pool - match.fee)) / winStake;
  if (view.claimed) return <p className="text-sm text-ally">Kazancını çektin.</p>;
  if (payout <= BigInt(0)) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 border border-gold/60 bg-gold/10 p-3.5">
      <p className="text-sm">
        {winStake === BigInt(0) ? "Kimse kazananı tutmadı. Bahsin iade edilecek:" : "Bahsin kazandı:"} <b className="text-gold">{fmt(payout)} MON</b>
      </p>
      <button type="button" disabled={busy} onClick={onClaim} className="bg-gold px-3 py-2 text-sm font-bold text-ink transition-opacity hover:opacity-90 disabled:opacity-50">
        Kazancı çek
      </button>
    </div>
  );
}

/** Bahis paneli: havuz dağılımı, ajan başına büyük çarpan, favori işareti ve bahis düğmesi. */
export function BetPanel({ view, now, connected, busy, onBet }: Props) {
  const { match, agents, agentIds, stakes, myBets, hp } = view;
  const [amount, setAmount] = useState("0.1");
  const open = match.phase === 1 && now < match.bettingEnd;
  const finished = match.phase === 3;
  const pool = match.pool;
  const fav = match.phase === 3 ? -1 : favoriteSlot(stakes);

  let parsed: bigint | null = null;
  try {
    parsed = Number(amount) > 0 ? parseEther(amount) : null;
  } catch {
    parsed = null;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="card flex items-center gap-4 p-4">
        <PoolDonut stakes={stakes} />
        <div className="min-w-0">
          <p className="mono-label">Toplam havuz</p>
          <p className="font-display text-3xl text-gold">{fmt(pool)} <span className="text-base font-normal text-mute">MON</span></p>
          <p className="mt-1 text-xs text-mute">%{FEE_BPS / 100} komisyon düşülür, kalan doğru bilenlere dağıtılır.</p>
        </div>
      </div>

      {open && (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="amount" className="text-sm text-mute">Bahis miktarı (MON)</label>
          <input
            id="amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-24 border border-white/40 bg-black px-2 py-1.5 text-sm text-chalk"
          />
          {CHIPS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setAmount(c)}
              className={`border px-2.5 py-1.5 text-sm transition-colors ${amount === c ? "border-white bg-white text-black" : "border-white/40 hover:border-white"}`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      <ul className="flex flex-col gap-3">
        {agents.map((a, i) => {
          const share = pool > BigInt(0) ? Number((stakes[i] * BigInt(1000)) / pool) / 10 : 0;
          const mult = multiplier(pool, stakes[i]);
          // Bahis açıkken: girilen miktarı şimdi bu karaktere yatırırsan kazanırsa alacağın oran (havuz henüz boşken de hesaplanır)
          const ifBet = open && parsed && pool > BigInt(0) ? Number(((pool + parsed) * BigInt(10000 - FEE_BPS)) / (stakes[i] + parsed)) / 10000 : null;
          const won = finished && match.winnerSlot === i;
          const dead = hp[i] === 0 && match.phase === 2;
          return (
            <li
              key={i}
              className={`card relative flex flex-col gap-3 p-3.5 ${won ? "!border-gold" : ""} ${dead ? "opacity-60" : ""}`}
              style={{ borderLeft: `5px solid ${slotColor(i, 55)}` }}
            >
              <div className="flex items-start gap-3">
                <svg viewBox="-60 -170 120 190" className="h-16 w-12 shrink-0" aria-hidden>
                  <Fighter name={a.name} slot={i} frame={null} time={0} won={won} deadStatic={dead} />
                </svg>
                <div className="min-w-0 flex-1">
                  <h3 className="flex flex-wrap items-center gap-2 font-display text-lg leading-tight">
                    {agentIds[i] ? <Link href={`/agent/${agentIds[i]}`} className="hover:underline">{a.name}</Link> : a.name}
                    {i === fav && <span className="bg-gold px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-black">Favori</span>}
                    {won && <span className="bg-gold px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-black">Kazandı</span>}
                  </h3>
                  <p className="text-xs text-mute">{a.wins} galibiyet, {a.matches} maç</p>
                  <p className="mt-1 text-xs leading-snug text-chalk/85">{a.persona}</p>
                </div>
                <div className="shrink-0 text-right" title="Bu ajan kazanırsa 1 MON'a karşılık getiri">
                  <p className="font-display text-3xl leading-none text-gold">{mult ? fmtMult(mult) : "–"}</p>
                  <p className="mt-1 text-[11px] text-mute">{mult ? "kazanırsa" : open ? "ilk bahis sende" : "bahis yok"}</p>
                  {ifBet && (
                    <p className="mt-1 text-[11px] text-chalk">
                      bahsinle <b>{fmtMult(ifBet)}</b>
                    </p>
                  )}
                </div>
              </div>

              <div role="meter" aria-valuenow={share} aria-valuemin={0} aria-valuemax={100} aria-label={`${a.name} bahis payı`}>
                <div className="h-1.5 overflow-hidden bg-white/15">
                  <div className="h-full transition-all duration-500" style={{ width: `${share}%`, background: slotColor(i, 58) }} />
                </div>
                <div className="mt-1 flex justify-between text-xs text-mute">
                  <span>{fmt(stakes[i])} MON</span>
                  <span>%{share.toLocaleString("tr-TR")} pay</span>
                </div>
              </div>

              {myBets[i] > BigInt(0) && <p className="text-xs text-ally">Senin bahsin: {fmt(myBets[i])} MON</p>}
              {open && (
                <button
                  type="button"
                  disabled={busy || !parsed}
                  onClick={() => parsed && onBet(i, parsed)}
                  className="w-full bg-white px-3 py-2 text-sm font-bold text-black transition-colors hover:bg-white/85 disabled:opacity-50"
                >
                  {connected ? `${a.name}'a bahis yap` : "Cüzdanı bağla ve bahis yap"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
