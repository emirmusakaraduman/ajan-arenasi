"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ARENA_ADDRESS, read } from "@/lib/arena";
import { tagsFor, toStats, type AgentStats } from "@/lib/agentStats";
import { shortMsg, toAgent, type RawAgent } from "@/lib/rawTypes";
import { slotColor } from "@/lib/playback";
import type { Agent } from "@/lib/useMatch";
import { Fighter } from "./Fighter";
import { ProfileSkeleton } from "./Skeletons";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="card p-3.5" title={hint}>
      <p className="text-xs text-mute">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold">{value}</p>
    </div>
  );
}

/** Ajanın kalıcı profili: kimlik, galibiyet oranı ve zincirde sayılan oynanış istatistikleri. */
export function AgentProfile({ agentId }: { agentId: number }) {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [stats, setStats] = useState<AgentStats | null | undefined>(undefined); // undefined: yükleniyor, null: kontrat desteklemiyor
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ARENA_ADDRESS) return;
    let stop = false;
    const load = async () => {
      try {
        const count = Number(await read<bigint>("agentCount"));
        if (agentId > count) { if (!stop) setError("Böyle bir ajan yok"); return; }
        const a = await read<RawAgent>("getAgent", [BigInt(agentId)]);
        if (stop) return;
        setAgent(toAgent(a));
        // Eski kontratta getStats yoktur: istatistik bölümü gizlenir
        const st = await read<Parameters<typeof toStats>[0]>("getStats", [BigInt(agentId)]).then(toStats).catch(() => null);
        if (!stop) { setStats(st); setError(null); }
      } catch (e) {
        if (!stop) setError(shortMsg(e));
      }
    };
    load();
    const t = setInterval(load, 8000);
    return () => { stop = true; clearInterval(t); };
  }, [agentId]);

  if (!ARENA_ADDRESS) return <p className="text-mute">Arena kontrat adresi tanımlı değil.</p>;
  if (error && !agent) return <p className="rounded-lg bg-hit/15 px-3 py-2 text-sm text-hit">{error}.</p>;
  if (!agent) return <ProfileSkeleton />;

  const slot = agentId % 6;
  const rate = agent.matches ? Math.round((agent.wins / agent.matches) * 100) : 0;
  const tags = stats ? tagsFor(stats, agent.matches) : [];

  return (
    <div className="flex flex-col gap-8">
      <Link href="/leaderboard" className="text-sm text-mute hover:text-chalk">‹ Skor tablosu</Link>

      <header className="card flex flex-wrap items-center gap-5 p-5" style={{ borderLeft: `6px solid ${slotColor(agentId % 6, 55)}` }}>
        <svg viewBox="-60 -170 120 190" className="h-36 w-auto shrink-0" aria-hidden>
          <ellipse cx="0" cy="4" rx="38" ry="9" fill={slotColor(slot, 40)} opacity="0.3" />
          <Fighter name={agent.name} slot={slot} frame={null} time={0} won={false} deadStatic={false} />
        </svg>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-3xl font-bold">
            {agent.name} <span className="text-base font-normal text-mute">#{agentId}</span>
          </h1>
          <p className="mt-1 text-sm text-chalk/85">{agent.persona || "Kişilik yok"}</p>
          <p className="mt-1 text-xs text-mute">{agent.strategy || "Strateji yok"}</p>
          <p className="mt-2 text-xs text-mute">Sahibi {short(agent.owner)} · Ajan cüzdanı {short(agent.operator)}</p>
          {tags.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <li key={t.label} title={t.hint} className="rounded-full bg-gold/20 px-2.5 py-1 text-xs font-medium text-gold">{t.label}</li>
              ))}
            </ul>
          )}
        </div>
      </header>

      <section aria-labelledby="rec-h">
        <h2 id="rec-h" className="mb-3 font-display text-lg font-medium">Kayıt</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Maç" value={agent.matches} />
          <Stat label="Galibiyet" value={agent.wins} />
          <Stat label="Galibiyet oranı" value={`%${rate}`} />
          {stats && <Stat label="Seri (en iyi)" value={`${stats.streak} (${stats.bestStreak})`} hint="Üst üste galibiyet ve rekoru" />}
        </div>
      </section>

      {stats === null && (
        <p className="border border-dashed border-white/25 p-4 text-sm text-mute">Bu kontrat sürümü ayrıntılı istatistik tutmuyor.</p>
      )}
      {stats && (
        <section aria-labelledby="st-h">
          <h2 id="st-h" className="mb-3 font-display text-lg font-medium">Oynanış istatistikleri</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Saldırı" value={stats.attacks} />
            <Stat label="Verilen hasar" value={stats.damageDealt} />
            <Stat label="Alınan hasar" value={stats.damageTaken} />
            <Stat label="İttifak" value={stats.alliances} hint="Karşılıklı ittifak sayısı" />
            <Stat label="İhanet etti" value={stats.betrayals} hint="Güvenen birine saldırdı" />
            <Stat label="İhanete uğradı" value={stats.betrayed} />
            <Stat label="Çalma" value={stats.steals} />
            <Stat label="Pakt" value={stats.pacts} hint="Toplu ittifaka katıldığı tur sayısı" />
          </div>
          <p className="mt-3 text-xs text-mute">İstatistikler zincirde sayılır, ajanın oyun gücünü değiştirmez; bahis oranları yalnızca havuz dağılımından oluşur.</p>
        </section>
      )}
    </div>
  );
}
