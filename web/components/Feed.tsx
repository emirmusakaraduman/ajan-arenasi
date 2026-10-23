"use client";

import type { Agent, Msg } from "@/lib/useMatch";
import { slotColor } from "@/lib/playback";
import type { Ev, RoundLog } from "@/lib/replay";

type Tone = "hit" | "gold" | "ally" | "mute";

const TONE: Record<Tone, { chip: string; icon: string }> = {
  hit: { chip: "bg-hit/20 text-hit", icon: "bg-hit text-black" },
  gold: { chip: "bg-gold/20 text-gold", icon: "bg-gold text-black" },
  ally: { chip: "bg-ally/20 text-ally", icon: "bg-ally text-black" },
  mute: { chip: "bg-white/10 text-white/70", icon: "bg-white/20 text-white" },
};

/** Olay simgeleri: küçük, tek renkli çizimler */
const ICON: Record<Ev["kind"], React.ReactNode> = {
  attack: <path d="M4 20 15 9m-3-5 8 8-3 3-8-8z" />,
  betrayal: <path d="M12 3v10m0 4v.5M5 21h14L12 3z" />,
  blocked: <path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z" />,
  defend: <path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z" />,
  alliance: <path d="M7 12l3 3 7-7M4 12a8 8 0 1 0 16 0 8 8 0 0 0-16 0" />,
  offer: <path d="M5 12h14M13 6l6 6-6 6" />,
  idle: <path d="M8 12h.01M12 12h.01M16 12h.01" />,
  eliminated: <path d="M6 6l12 12M18 6 6 18" />,
  steal: <path d="M5 12h12m-4-4 4 4-4 4" />,
  charge: <path d="M13 3 5 14h6l-1 7 8-11h-6z" />,
  pact: <path d="M4 17a8 8 0 0 1 16 0M8 17v-3m8 3v-3M12 17V9" />,
  trap: <path d="M12 3v10m0 4v.5M5 21h14L12 3z" />,
  spring: <path d="M12 21s-7-4.6-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.400-7 10-7 10z" />,
};

function Name({ a, slot }: { a: Agent[]; slot: number | undefined }) {
  if (slot === undefined) return null;
  return (
    <b className="inline-flex items-center gap-1.5 font-semibold text-white">
      <span className="h-2 w-2 rounded-full" style={{ background: slotColor(slot, 62) }} aria-hidden />
      {a[slot]?.name}
    </b>
  );
}

function describe(e: Ev, a: Agent[]): { tone: Tone; body: React.ReactNode; chip?: string } {
  const f = <Name a={a} slot={e.from} />;
  const t = <Name a={a} slot={e.to} />;
  switch (e.kind) {
    case "betrayal":
      return { tone: "gold", body: <>{f} ihanet etti, {t} ittifak bekliyordu</>, chip: `-${e.dmg} can` };
    case "attack":
      return { tone: "hit", body: e.heavy ? <>{f}, hazırladığı ağır saldırıyı {t} ajanına indirdi</> : <>{f}, {t} ajanına saldırdı</>, chip: `-${e.dmg} can` };
    case "steal":
      return { tone: "hit", body: <>{f}, {t} ajanından can çaldı</>, chip: "-1 / +1 can" };
    case "charge":
      return { tone: "gold", body: <>{f} güç topluyor, sonraki tur ağır vuracak</>, chip: "Savunmasız" };
    case "pact":
      return { tone: "ally", body: <>{f} toplu ittifaka katıldı</>, chip: "+1 can" };
    case "trap":
      return { tone: "hit", body: <>Arena tuzağı: {f} can kaybetti</>, chip: "-1 can" };
    case "spring":
      return { tone: "ally", body: <>Şifa pınarı: {f} can kazandı</>, chip: "+1 can" };
    case "blocked":
      return { tone: "mute", body: <>{f} saldırdı, {t} kalkanla durdurdu</>, chip: "Hasar yok" };
    case "alliance":
      return { tone: "ally", body: <>{f} ve {t} ittifak kurdu</>, chip: "+1 can" };
    case "offer":
      return { tone: "mute", body: <>{f}, {t} ajanına ittifak teklif etti</>, chip: "Karşılık yok" };
    case "defend":
      return { tone: "mute", body: <>{f} savunmaya geçti</> };
    case "idle":
      return { tone: "mute", body: <>{f} hamle göndermedi</>, chip: "Savunmasız" };
    case "eliminated":
      return { tone: "hit", body: <>{f} arenadan elendi</>, chip: "Elendi" };
  }
}

// Önemli olaylar (ihanet, eleme, saldırı, ittifak) önce gelir
const weight: Record<string, number> = { betrayal: 0, eliminated: 1, attack: 2, alliance: 3, blocked: 4, offer: 5, defend: 6, idle: 7 };

type Props = { agents: Agent[]; history: RoundLog[]; messages: Msg[][]; live: string | null; matchId: number; phase: number };

/** Canlı akış: en yeni tur en üstte; her tur bir kart, içinde ajan mesajları (balon) ve olaylar (simgeli satır) */
export function Feed({ agents, history, messages, live, matchId, phase }: Props) {
  const rounds = [...history].reverse();
  return (
    <div aria-live="polite" className="flex flex-col gap-4">
      {live && (
        <p className="flex items-start gap-2 rounded-lg border border-white/20 bg-black/30 px-3 py-2.5 text-sm leading-snug text-white">
          <span className="mt-1.5 h-2 w-2 shrink-0 animate-pulse rounded-full bg-hit" aria-hidden />
          {live}
        </p>
      )}
      {rounds.length === 0 && (
        <p className="rounded-lg border border-dashed border-white/30 px-3 py-4 text-center text-sm text-white/75">
          {phase === 1 ? `Maç #${matchId} henüz başlamadı. İlk turun olayları burada görünecek.` : "İlk turun hamleleri açılınca burada görünecek."}
        </p>
      )}
      {rounds.map((r, idx) => {
        const said = messages[r.round] ?? [];
        return (
          <section key={r.round} className={`overflow-hidden rounded-xl border bg-black/30 ${idx === 0 ? "border-white/40" : "border-white/15"}`}>
            <header className="flex items-center justify-between border-b border-white/10 px-3 py-2">
              <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-white">Tur {r.round + 1}</h3>
              {idx === 0 && <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase text-black">Son tur</span>}
            </header>

            {said.length > 0 && (
              <ul className="flex flex-col gap-2 px-3 pt-3">
                {said.map((m, k) => (
                  <li key={k} className="flex flex-col items-start">
                    <span className="mb-0.5 text-[11px] font-semibold" style={{ color: slotColor(m.slot, 70) }}>{agents[m.slot]?.name}</span>
                    <span className="rounded-2xl rounded-tl-sm bg-white px-3 py-1.5 text-sm leading-snug text-black">{m.text}</span>
                  </li>
                ))}
              </ul>
            )}

            <ul className="flex flex-col divide-y divide-white/10 px-3 py-1">
              {[...r.events]
                .sort((x, y) => weight[x.kind] - weight[y.kind])
                .map((e, k) => {
                  const { tone, body, chip } = describe(e, agents);
                  return (
                    <li key={k} className="flex items-center gap-2.5 py-2 text-sm leading-snug text-white/90">
                      <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${TONE[tone].icon}`} aria-hidden>
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">{ICON[e.kind]}</svg>
                      </span>
                      <span className="min-w-0 flex-1">{body}</span>
                      {chip && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${TONE[tone].chip}`}>{chip}</span>}
                    </li>
                  );
                })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
