"use client";

import { useMemo } from "react";
import { slotColor } from "@/lib/playback";
import { summarize } from "@/lib/summary";
import type { MatchView } from "@/lib/useMatch";

/** Maç sonu özeti: ödüller ve ajan başına istatistik. Veriler zaten oynatılan turların olaylarından hesaplanır. */
export function MatchSummary({ view }: { view: MatchView }) {
  const { agents, awards } = useMemo(() => summarize(view.history, view.agents.length), [view.history, view.agents.length]);
  const name = (s: number) => view.agents[s]?.name ?? `#${s}`;
  const chip = (s: number) => (
    <b className="inline-flex items-center gap-1.5" style={{ color: slotColor(s, 70) }}>
      <span className="h-2 w-2 rounded-full" style={{ background: slotColor(s, 62) }} aria-hidden />
      {name(s)}
    </b>
  );

  const items: { icon: string; title: string; body: React.ReactNode }[] = [];
  if (awards.topDamage) items.push({ icon: "⚔", title: "En çok hasar", body: <>{chip(awards.topDamage.slot)} · {awards.topDamage.value} can</> });
  if (awards.bigBetrayal) items.push({ icon: "🗡", title: "En büyük ihanet", body: <>{chip(awards.bigBetrayal.from)} → {chip(awards.bigBetrayal.to)} · tur {awards.bigBetrayal.round}, -{awards.bigBetrayal.dmg}</> });
  if (awards.topThief) items.push({ icon: "✋", title: "En büyük hırsız", body: <>{chip(awards.topThief.slot)} · {awards.topThief.value} can çaldı</> });
  if (awards.mostAllies) items.push({ icon: "🤝", title: "En çok ittifak", body: <>{chip(awards.mostAllies.slot)} · {awards.mostAllies.value} tur</> });
  if (awards.firstOut) items.push({ icon: "💀", title: "İlk elenen", body: <>{chip(awards.firstOut.slot)} · tur {awards.firstOut.round}</> });

  return (
    <section aria-labelledby="sum-h" className="card p-4">
      <h2 id="sum-h" className="mb-3 font-display text-xl">Maç özeti</h2>
      <p className="mb-4 text-sm">
        Kazanan {chip(view.match.winnerSlot)}, {view.history.length} turda.
      </p>

      {items.length > 0 ? (
        <ul className="mb-4 grid gap-2 sm:grid-cols-2">
          {items.map((it) => (
            <li key={it.title} className="flex items-start gap-3 border border-white/15 px-3 py-2">
              <span className="text-xl leading-none" aria-hidden>{it.icon}</span>
              <span className="min-w-0 text-sm">
                <span className="mono-label block text-[11px]">{it.title}</span>
                {it.body}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-4 text-sm text-mute">Bu maçta dikkat çeken bir olay olmadı: herkes temkinli oynadı.</p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <caption className="sr-only">Ajan başına maç istatistikleri</caption>
          <thead>
            <tr className="border-b border-white/25 text-left text-xs text-mute">
              <th className="py-1.5 pr-2 font-normal">Ajan</th>
              <th className="px-2 text-right font-normal">Verdi</th>
              <th className="px-2 text-right font-normal">Aldı</th>
              <th className="px-2 text-right font-normal">İhanet</th>
              <th className="px-2 text-right font-normal">İttifak</th>
              <th className="pl-2 text-right font-normal">Çalma</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => (
              <tr key={a.slot} className="border-b border-white/10 last:border-0">
                <td className="py-1.5 pr-2">{chip(a.slot)}{a.outRound ? <span className="ml-1.5 text-xs text-mute">(tur {a.outRound}&apos;de elendi)</span> : null}</td>
                <td className="px-2 text-right tabular-nums">{a.dealt}</td>
                <td className="px-2 text-right tabular-nums">{a.taken}</td>
                <td className="px-2 text-right tabular-nums">{a.betrayals}{a.betrayed ? <span className="text-mute"> / {a.betrayed}</span> : null}</td>
                <td className="px-2 text-right tabular-nums">{a.alliances}</td>
                <td className="pl-2 text-right tabular-nums">{a.steals}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-mute">İhanet sütunu: ettiği / uğradığı.</p>
      </div>
    </section>
  );
}
