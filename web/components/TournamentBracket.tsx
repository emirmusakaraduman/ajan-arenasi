"use client";

import Link from "next/link";
import { fmt, MAX_HP } from "@/lib/arena";
import { TOURNAMENT_ADDRESS, tournamentTarget, useBracket, type BracketMatch } from "@/lib/tournament";
import { useWallet } from "@/lib/wallet";
import { slotColor } from "@/lib/playback";
import type { Agent } from "@/lib/useMatch";
import { BracketSkeleton } from "./Skeletons";
import { Fighter } from "./Fighter";

const roundName = (r: number, rounds: number) =>
  r === rounds - 1 ? "Final" : r === rounds - 2 ? "Yarı final" : r === rounds - 3 ? "Çeyrek final" : `${r + 1}. tur`;

/** Küçük can çubuğu: canlı maçta ajanın kalan canı */
function Hp({ hp }: { hp: number }) {
  return (
    <span className="flex gap-[2px]" role="meter" aria-valuenow={hp} aria-valuemin={0} aria-valuemax={MAX_HP} aria-label="Can">
      {Array.from({ length: MAX_HP }, (_, i) => (
        <span key={i} className="h-1.5 w-1.5" style={{ background: i < hp ? "var(--ally)" : "rgba(255,255,255,.15)" }} />
      ))}
    </span>
  );
}

function Side({ agent, id, slot, won, lost, hp }: { agent: Agent | undefined; id: number; slot: number; won: boolean; lost: boolean; hp?: number }) {
  const dead = hp === 0;
  return (
    <div
      className={`flex items-center gap-2.5 py-1.5 pl-2.5 pr-3 ${won ? "bg-gold/15" : ""} ${lost || dead ? "opacity-50" : ""}`}
      style={{ borderLeft: `4px solid ${slotColor(slot, 55)}` }}
    >
      <svg viewBox="-60 -170 120 190" className="h-10 w-7 shrink-0" aria-hidden>
        <Fighter name={agent?.name ?? "x"} slot={slot} frame={null} time={0} won={won} deadStatic={lost || dead} />
      </svg>
      <div className="min-w-0 flex-1">
        <Link href={`/agent/${id}`} className="block truncate text-sm font-medium hover:underline">{agent?.name ?? `#${id}`}</Link>
        {hp !== undefined && <Hp hp={hp} />}
      </div>
      {won && <span className="text-xs font-bold text-gold">Kazandı</span>}
    </div>
  );
}

function MatchBox({ m, agents }: { m: BracketMatch; agents: Map<number, Agent> }) {
  const status = m.phase === 1 ? "Bahis açık" : m.phase === 2 ? "Canlı" : m.phase === 3 ? "Bitti" : "Bekliyor";
  const tone = m.phase === 2 ? "bg-hit/20 text-hit" : m.phase === 1 ? "bg-gold/20 text-gold" : "bg-white/10 text-mute";
  return (
    <div className="card">
      <div className="flex items-center justify-between border-b border-white/15 px-3 py-1.5 text-xs text-mute">
        <span>Maç #{m.id}</span>
        <span className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 ${tone}`}>
          {m.phase === 2 && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-hit" aria-hidden />}
          {status}
        </span>
      </div>
      {m.agentIds.map((id, s) => (
        <Side key={id} agent={agents.get(id)} id={id} slot={s} won={m.phase === 3 && m.winnerSlot === s} lost={m.phase === 3 && m.winnerSlot !== s} hp={m.phase === 2 ? m.hp[s] : undefined} />
      ))}
      <div className="flex items-center justify-between border-t border-white/15 px-3 py-1.5 text-xs text-mute">
        <span>{m.pool > BigInt(0) ? `Havuz ${fmt(m.pool)} MON` : "Havuz boş"}</span>
        <Link href={`/match/${m.id}`} className="font-medium text-chalk hover:underline">
          {m.phase === 3 ? "Tekrar izle ›" : m.phase === 2 ? "İzle ›" : m.phase === 1 ? "Bahis yap ›" : "Aç ›"}
        </Link>
      </div>
    </div>
  );
}

/** Eleme ağacı: turlar soldan sağa, açılmamış turlar silik yer tutucu, mevcut tur vurgulu. */
export function TournamentBracket({ tid }: { tid: number }) {
  const wallet = useWallet();
  const { bracket, error, reload } = useBracket(tid);
  const busy = wallet.tx.status === "wallet" || wallet.tx.status === "pending";

  if (!TOURNAMENT_ADDRESS) return <p className="text-mute">Turnuva kontratı tanımlı değil. NEXT_PUBLIC_TOURNAMENT_ADDRESS değerini web/.env.local dosyasına yaz.</p>;
  if (error && !bracket) return <p className="rounded-lg bg-hit/15 px-3 py-2 text-sm text-hit">{error}.</p>;
  if (!bracket) return <BracketSkeleton />;

  const champ = bracket.champion ? bracket.agents.get(bracket.champion) : null;
  return (
    <div className="flex flex-col gap-8">
      <Link href="/tournament" className="text-sm text-mute hover:text-chalk">‹ Turnuvalar</Link>
      <div>
        <h1 className="font-display text-3xl font-bold">Turnuva #{bracket.id}</h1>
        <p className="mt-1 text-sm text-mute">
          {bracket.size} ajan, eleme usulü. Her eşleşme Arena&apos;da normal bir maçtır: açılan maçlara bahis yapılabilir, kazanan bir üst tura çıkar.
        </p>
      </div>

      {champ && (
        <div className="flex items-center justify-center gap-5 border border-gold/60 bg-gold/10 p-5">
          <svg viewBox="-60 -170 120 190" className="h-24 w-auto" aria-hidden>
            <Fighter name={champ.name} slot={bracket.champion % 6} frame={null} time={0} won deadStatic={false} />
          </svg>
          <div>
            <p className="mono-label">Şampiyon</p>
            <p className="font-display text-4xl font-bold text-gold">
              <Link href={`/agent/${bracket.champion}`} className="hover:underline">{champ.name}</Link>
            </p>
          </div>
        </div>
      )}

      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max gap-6">
          {bracket.matches.map((row, r) => {
            const current = r === bracket.round && !champ;
            return (
              <section key={r} aria-label={roundName(r, bracket.rounds)} className="flex w-64 flex-col">
                <h2 className={`mb-3 flex items-center gap-2 font-display text-sm font-medium ${current ? "text-chalk" : "text-mute"}`}>
                  {roundName(r, bracket.rounds)}
                  {current && <span className="bg-white px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-black">Şimdi</span>}
                </h2>
                <div className="flex flex-1 flex-col justify-around gap-3">
                  {row.length > 0
                    ? row.map((m) => <MatchBox key={m.id} m={m} agents={bracket.agents} />)
                    : Array.from({ length: bracket.size >> (r + 1) }, (_, i) => (
                        <div key={i} className="border border-dashed border-white/20 px-3 py-6 text-center text-xs text-mute">Önceki turun kazananları</div>
                      ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {bracket.roundDone && (
        <div className="flex flex-wrap items-center gap-3 border border-white/60 bg-white/10 px-4 py-3 text-sm">
          <p className="flex-1">
            {roundName(bracket.round, bracket.rounds)} bitti.{" "}
            {bracket.round === bracket.rounds - 1 ? "Şampiyonu ilan etmek için bir işlem gönder." : "Bir sonraki turun maçlarını açmak için bir işlem gönder."}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              if (!wallet.address) { await wallet.connect(); return; }
              if (await wallet.send("advance", [BigInt(bracket.id)], undefined, tournamentTarget)) reload();
            }}
            className="bg-white px-4 py-2 font-bold text-black transition-colors hover:bg-white/85 disabled:opacity-50"
          >
            {!wallet.address ? "Cüzdanı bağla" : bracket.round === bracket.rounds - 1 ? "Şampiyonu belirle" : "Sonraki turu aç"}
          </button>
        </div>
      )}
    </div>
  );
}
