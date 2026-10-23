"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FLAG_ADVANCED, FLAG_EVENTS, ARENA_ADDRESS, read } from "@/lib/arena";
import { TOURNAMENT_ADDRESS, tournamentTarget, useTournamentList } from "@/lib/tournament";
import { useWallet } from "@/lib/wallet";
import type { Agent } from "@/lib/useMatch";
import { CardsSkeleton } from "./Skeletons";
import { toAgent, type RawAgent } from "@/lib/rawTypes";

const SIZES = [2, 4, 8, 16] as const;
const field = "w-full rounded-md border border-line bg-deep px-3 py-2 text-sm text-chalk placeholder:text-mute/70";

/** Turnuva listesi ve kurma sihirbazı. Para tutmaz: yalnızca eşleşmeleri Arena'da maç olarak açar. */
export function TournamentHome() {
  const wallet = useWallet();
  const { list, error } = useTournamentList();
  const [agents, setAgents] = useState<(Agent & { id: number })[]>([]);
  const [size, setSize] = useState<(typeof SIZES)[number]>(4);
  const [picked, setPicked] = useState<number[]>([]);
  const [bettingSeconds, setBettingSeconds] = useState("120");
  const [roundSeconds, setRoundSeconds] = useState("10");
  const [maxRounds, setMaxRounds] = useState("6");
  const [advanced, setAdvanced] = useState(false);
  const [events, setEvents] = useState(false);
  const busy = wallet.tx.status === "wallet" || wallet.tx.status === "pending";

  useEffect(() => {
    if (!ARENA_ADDRESS) return;
    (async () => {
      try {
        const n = Math.min(Number(await read<bigint>("agentCount")), 60);
        const rows = await Promise.all(
          Array.from({ length: n }, (_, i) => read<RawAgent>("getAgent", [BigInt(i + 1)]).then((x) => ({ ...toAgent(x), id: i + 1 }))),
        );
        setAgents(rows);
      } catch {}
    })();
  }, []);

  if (!TOURNAMENT_ADDRESS) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Turnuvalar</h1>
        <p className="text-mute">Turnuva kontratı tanımlı değil. Kontratı dağıtıp adresini web/.env.local dosyasına NEXT_PUBLIC_TOURNAMENT_ADDRESS olarak yaz.</p>
      </div>
    );
  }

  const full = picked.length === size;
  const toggle = (id: number) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < size ? [...p, id] : p));
  const shuffle = () => setPicked((p) => [...p].sort(() => Math.random() - 0.5)); // kura: sıra eşleşmeyi belirler

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Turnuvalar</h1>
        <p className="mt-2 max-w-2xl text-chalk/85">
          Ajanlar eleme usulüyle karşılaşır. Her eşleşme Arena&apos;da normal bir maç olarak açılır, izleyiciler bahis yapar; kazanan bir üst tura çıkar. Turnuva para tutmaz.
        </p>
      </div>

      <section aria-labelledby="tl-h">
        <h2 id="tl-h" className="mb-3 font-display text-lg font-medium">Turnuvalar</h2>
        {error && <p className="mb-3 rounded-lg bg-hit/15 px-3 py-2 text-sm text-hit">{error}.</p>}
        {!list && !error && <CardsSkeleton n={2} className="h-16" />}
        {list && list.length === 0 && <p className="border border-dashed border-white/25 p-5 text-sm text-mute">Henüz turnuva yok. Aşağıdan ilkini kur.</p>}
        {list && list.length > 0 && (
          <ul className="grid gap-2 sm:grid-cols-2">
            {list.map((t) => (
              <li key={t.id}>
                <Link href={`/tournament/${t.id}`} className="card card-hover flex items-center justify-between gap-3 px-4 py-3">
                  <span>
                    <b>Turnuva #{t.id}</b>
                    <span className="block text-xs text-mute">{t.size} ajan</span>
                  </span>
                  {t.champion ? (
                    <span className="text-sm text-gold">Şampiyon {t.championName}</span>
                  ) : (
                    <span className="rounded-full bg-hit/20 px-2.5 py-1 text-xs font-medium text-hit">{t.round + 1}. tur / {t.rounds}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="nt-h" className="max-w-2xl">
        <h2 id="nt-h" className="mb-3 font-display text-lg font-medium">Turnuva kur</h2>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const flags = (advanced ? FLAG_ADVANCED : 0) | (events ? FLAG_EVENTS : 0);
            const args = [picked.map((p) => BigInt(p)), Number(bettingSeconds), Number(roundSeconds), Number(maxRounds), flags];
            if (await wallet.send("createTournament", args, undefined, tournamentTarget)) setPicked([]);
          }}
        >
          <div role="group" aria-label="Ajan sayısı" className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-mute">Ajan sayısı</span>
            {SIZES.map((s) => (
              <button key={s} type="button" aria-pressed={size === s} onClick={() => { setSize(s); setPicked((p) => p.slice(0, s)); }}
                className={`rounded-md border px-3 py-1.5 ${size === s ? "border-monad bg-monad/20" : "border-line hover:border-mute"}`}>
                {s}
              </button>
            ))}
          </div>

          <fieldset>
            <legend className="mb-1.5 block text-sm text-mute">Ajanları seç ({picked.length}/{size}). Seçim sırası eşleşmeyi belirler: 1. ile 2., 3. ile 4. ...</legend>
            {agents.length === 0 ? (
              <p className="text-sm text-mute">Henüz ajan yok. Önce <Link href="/studio" className="text-monad underline">stüdyodan</Link> ajan yarat.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {agents.map((a) => {
                  const idx = picked.indexOf(a.id);
                  return (
                    <label key={a.id} className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm ${idx >= 0 ? "border-monad bg-monad/20" : "border-line hover:border-mute"}`}>
                      <input type="checkbox" className="sr-only" checked={idx >= 0} onChange={() => toggle(a.id)} />
                      {idx >= 0 && <b className="mr-1.5 text-monad">{idx + 1}</b>}
                      {a.name}
                    </label>
                  );
                })}
              </div>
            )}
            {picked.length > 1 && <button type="button" onClick={shuffle} className="mt-2 text-xs text-mute underline hover:text-chalk">Sırayı karıştır (kura)</button>}
          </fieldset>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label htmlFor="t-bet" className="mb-1 block text-sm text-mute">Bahis (sn)</label>
              <input id="t-bet" inputMode="numeric" className={field} value={bettingSeconds} onChange={(e) => setBettingSeconds(e.target.value)} />
            </div>
            <div>
              <label htmlFor="t-round" className="mb-1 block text-sm text-mute">Hamle (sn)</label>
              <input id="t-round" inputMode="numeric" className={field} value={roundSeconds} onChange={(e) => setRoundSeconds(e.target.value)} />
            </div>
            <div>
              <label htmlFor="t-max" className="mb-1 block text-sm text-mute">Tur sayısı</label>
              <input id="t-max" inputMode="numeric" className={field} value={maxRounds} onChange={(e) => setMaxRounds(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} /> Gelişmiş hamleler</label>
            <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={events} onChange={(e) => setEvents(e.target.checked)} /> Arena olayları</label>
          </div>

          <button type="submit" disabled={busy || !full} className="rounded-lg bg-monad px-4 py-2.5 text-sm font-bold text-on-monad hover:bg-monad/85 disabled:opacity-50">
            {wallet.address ? "Turnuvayı kur" : "Cüzdanı bağla ve turnuvayı kur"}
          </button>
          <p className="text-xs text-mute">
            İlk turun maçları hemen açılır. Maçlar agents klasöründe <code className="text-chalk">npm run watch</code> açıkken kendiliğinden oynanır. Tur bitince herkes ağaç sayfasından bir sonraki turu açabilir.
          </p>
        </form>
      </section>
    </div>
  );
}
