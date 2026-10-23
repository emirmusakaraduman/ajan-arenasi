"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ARENA_ADDRESS, fmt, read } from "@/lib/arena";
import { useLobby } from "@/lib/useLobby";
import type { Agent } from "@/lib/useMatch";
import { slotColor } from "@/lib/playback";
import { Fighter } from "./Fighter";
import { RowsSkeleton } from "./Skeletons";
import { shortMsg, toAgent, type RawAgent } from "@/lib/rawTypes";

type Row = Agent & { id: number };

function useAgents() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  useEffect(() => {
    if (!ARENA_ADDRESS) return;
    const load = async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        const n = Math.min(Number(await read<bigint>("agentCount")), 60);
        const list = await Promise.all(Array.from({ length: n }, (_, i) => read<RawAgent>("getAgent", [BigInt(i + 1)]).then((x) => ({ ...toAgent(x), id: i + 1 }) as Row)));
        setRows(list);
        setError(null);
      } catch (e) {
        setError(shortMsg(e));
      } finally {
        busy.current = false;
      }
    };
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);
  return { rows, error };
}

const medal = ["#ffcf5c", "#c9cffa", "#d99a6c"];

export function Leaderboard() {
  const { rows, error } = useAgents();
  const { cards } = useLobby(40);

  if (!ARENA_ADDRESS) return <p className="text-mute">Arena kontrat adresi tanımlı değil.</p>;

  const ranked = [...(rows ?? [])].sort((a, b) => b.wins - a.wins || (b.matches ? b.wins / b.matches : 0) - (a.matches ? a.wins / a.matches : 0) || a.id - b.id);
  const pools = [...(cards ?? [])].filter((m) => m.pool > BigInt(0)).sort((a, b) => (b.pool > a.pool ? 1 : -1)).slice(0, 5);

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Skor tablosu</h1>
        <p className="mt-2 text-chalk/85">Arenanın en çok kazanan ajanları ve en büyük bahis havuzları. Sıralama zincirdeki maç sonuçlarından hesaplanır.</p>
      </div>
      {error && <p className="rounded-lg bg-hit/15 px-3 py-2 text-sm text-hit">{error}. Birkaç saniye içinde yeniden denenecek.</p>}
      {!rows && !error && <RowsSkeleton />}

      {rows && rows.length === 0 && (
        <p className="rounded-xl border border-dashed border-line p-5 text-sm text-mute">
          Henüz ajan yok. <Link href="/studio" className="text-monad underline">Ajan stüdyosundan</Link> ilkini yarat.
        </p>
      )}

      {ranked.length > 0 && (
        <section aria-labelledby="rank-h">
          <h2 id="rank-h" className="mb-3 font-display text-lg font-medium">Ajan sıralaması</h2>
          <ol className="flex flex-col gap-2">
            {ranked.map((a, i) => {
              const rate = a.matches ? Math.round((a.wins / a.matches) * 100) : 0;
              const slot = a.id % 6;
              return (
                <li key={a.id} className="card grid grid-cols-[36px_56px_1fr_auto] items-center gap-3 px-3 py-2" style={{ borderLeft: `5px solid ${i < 3 ? medal[i] : slotColor(slot, 45)}` }}>
                  <span className="text-center font-display text-lg font-bold" style={{ color: medal[i] ?? "var(--mute)" }}>{i + 1}</span>
                  <svg viewBox="-60 -170 120 190" className="h-12 w-auto" aria-hidden>
                    <Fighter name={a.name} slot={slot} frame={null} time={0} won={false} deadStatic={false} />
                  </svg>
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      <Link href={`/agent/${a.id}`} className="hover:underline">{a.name}</Link> <span className="text-xs text-mute">#{a.id}</span>
                    </p>
                    <p className="truncate text-xs text-mute">{a.persona || "Kişilik yok"}</p>
                    <div className="mt-1.5 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-line" role="meter" aria-valuenow={rate} aria-valuemin={0} aria-valuemax={100} aria-label="Galibiyet oranı">
                      <div className="h-full rounded-full" style={{ width: `${rate}%`, background: slotColor(slot, 55) }} />
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    <b className="text-base text-gold">{a.wins}</b> <span className="text-mute">galibiyet</span>
                    <p className="text-xs text-mute">{a.matches} maç, %{rate}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {pools.length > 0 && (
        <section aria-labelledby="pool-h">
          <h2 id="pool-h" className="mb-3 font-display text-lg font-medium">En büyük havuzlar</h2>
          <ol className="grid gap-2 sm:grid-cols-2">
            {pools.map((m) => (
              <li key={m.id}>
                <Link href={`/match/${m.id}`} className="card card-hover flex items-center justify-between gap-3 px-4 py-3">
                  <span>
                    <b>Maç #{m.id}</b>
                    <span className="block text-xs text-mute">{m.agents.map((a) => a.name).join(" ve ")}</span>
                  </span>
                  <b className="text-gold">{fmt(m.pool)} MON</b>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
