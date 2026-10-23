"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ARENA_ADDRESS, fmt } from "@/lib/arena";
import { useLobby, type MatchCard } from "@/lib/useLobby";
import { Fighter } from "./Fighter";
import { slotColor } from "@/lib/playback";
import { Hero, type HeroStats } from "./Hero";
import { CardsSkeleton } from "./Skeletons";
import { favoriteSlot, fmtMult, multiplier } from "@/lib/odds";

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(s % 60, 0)).padStart(2, "0")}`;

function Pill({ m, now }: { m: MatchCard; now: number }) {
  if (m.phase === 1)
    return now < m.bettingEnd ? (
      <span className="rounded-full bg-gold/20 px-2.5 py-1 text-xs font-medium text-gold">Bahis açık {clock(m.bettingEnd - now)}</span>
    ) : (
      <span className="rounded-full bg-monad/25 px-2.5 py-1 text-xs font-medium">Başlıyor</span>
    );
  if (m.phase === 2)
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-hit/20 px-2.5 py-1 text-xs font-medium text-hit">
        <span className="h-2 w-2 animate-pulse rounded-full bg-hit" aria-hidden /> Canlı, tur {m.round + 1}/{m.maxRounds}
      </span>
    );
  return <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-mute">Bitti</span>;
}

function Card({ m, now, big }: { m: MatchCard; now: number; big?: boolean }) {
  const winner = m.phase === 3 ? m.agents[m.winnerSlot] : null;
  // Canlı oranlar: havuz dağılımından, komisyon düşülmüş çarpan. Bahis yoksa gösterilmez.
  const odds = m.phase !== 3 && m.pool > BigInt(0) && m.stakes.length === m.agents.length;
  const fav = odds ? favoriteSlot(m.stakes) : -1;
  const mult = (i: number) => multiplier(m.pool, m.stakes[i]);
  return (
    <Link
      href={`/match/${m.id}`}
      className="card card-hover group flex flex-col gap-3 p-4"
    >
      <div className="flex items-center gap-2">
        <h3 className="font-display text-2xl leading-none">Maç #{m.id}</h3>
        <Pill m={m} now={now} />
        <span className="ml-auto text-sm text-mute">
          Havuz <b className="text-gold">{fmt(m.pool)}</b> MON
        </span>
      </div>
      <div className="flex items-end justify-center gap-1">
        {m.agents.map((a, i) => (
          <div key={i} className="text-center" style={{ width: big ? 124 : 92 }}>
            <svg viewBox="-60 -170 120 190" className="mx-auto w-full">
              <ellipse cx="0" cy="4" rx="38" ry="9" fill={slotColor(i, 40)} opacity="0.3" />
              <Fighter
                name={a.name}
                slot={i}
                frame={null}
                time={0}
                won={m.phase === 3 && m.winnerSlot === i}
                deadStatic={m.phase === 3 && m.winnerSlot !== i}
              />
            </svg>
            <p className="truncate border-b-2 pb-0.5 text-xs font-medium" style={{ borderColor: slotColor(i, 55) }}>{a.name}</p>
            {odds && (
              <p className={`text-[11px] ${i === fav ? "font-bold text-gold" : "text-mute"}`} title={fav === i ? "Favori: en çok bahis alan" : "Kazanırsa getiri çarpanı"}>
                {mult(i) ? fmtMult(mult(i)!) : "–"}
              </p>
            )}
          </div>
        ))}
      </div>
      <p className="text-sm text-mute">
        {winner ? (
          <>
            Kazanan <b className="text-chalk">{winner.name}</b>
          </>
        ) : m.phase === 1 ? (
          "Kazananı tahmin et, bahis yap."
        ) : (
          "Dövüş sürüyor, izle."
        )}
        <span className="mono-label float-right underline-offset-4 group-hover:underline">{m.phase === 3 ? "Maçı izle" : "Arenaya gir"}</span>
      </p>
    </Link>
  );
}

/** Hamle rehberi: simge, ad ve tek cümlelik etki. Gelişmiş olanlar maç kurarken açılır. */
const MOVES: { icon: string; name: string; text: string; advanced?: boolean }[] = [
  { icon: "🛡", name: "Savun", text: "Bu tur gelen saldırıları engeller." },
  { icon: "⚔", name: "Saldır", text: "2 hasar verir. Hedef ittifak teklif ediyorsa ihanet: 4 hasar." },
  { icon: "🤝", name: "İttifak", text: "Karşılıklıysa ikiniz de +1 can kazanırsınız, ama hedef saldırırsa 4 can kaybedersin." },
  { icon: "✋", name: "Çal", text: "Savunmayan hedeften 1 can çalar.", advanced: true },
  { icon: "⚡", name: "Güç topla", text: "Bir tur savunmasız hazırlan, sonraki tur 4 hasar vur.", advanced: true },
  { icon: "👥", name: "Pakt", text: "3 ya da daha fazla ajan seçerse herkes +1 can kazanır.", advanced: true },
];

const STEPS = [
  ["Ajanını yarat", "Ad, kişilik ve strateji yaz. Karakterin adından üretilir."],
  ["Maç aç ve davet et", "Bağlantıyı arkadaşlarına gönder, hepsi aynı anda izler."],
  ["Bahis yap", "Maç başlamadan kazananı seç. Doğru bilen havuzu paylaşır."],
];

export function Lobby() {
  const { cards, count, error } = useLobby(12);
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Math.floor(Date.now() / 1000));
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  if (!ARENA_ADDRESS)
    return <p className="text-mute">Arena kontrat adresi tanımlı değil. NEXT_PUBLIC_ARENA_ADDRESS değerini web/.env.local dosyasına yaz.</p>;

  const active = (cards ?? []).filter((m) => m.phase !== 3);
  const past = (cards ?? []).filter((m) => m.phase === 3);
  const hot = active[0];
  const stats: HeroStats | null = cards
    ? {
        matches: count,
        live: active.length,
        agents: new Set(cards.flatMap((m) => m.agentIds)).size,
        pool: fmt(cards.reduce((sum, m) => sum + m.pool, BigInt(0))),
        winner: past[0] ? { name: past[0].agents[past[0].winnerSlot]?.name ?? "?", matchId: past[0].id } : null,
      }
    : null;

  return (
    <div className="flex flex-col">
      <Hero playHref={hot ? `/match/${hot.id}` : "/studio"} playLabel={hot ? (hot.phase === 2 ? "Canlı izle" : "Bahis yap") : "İlk ajanını yarat"} stats={stats} />

      {/* Siyah bölüm: nasıl oynanır */}
      <section id="nasil" aria-labelledby="nasil-h" className="theme-dark ml-[calc(50%-50vw)] w-screen scroll-mt-16 bg-black px-4 pb-20 pt-10 sm:px-6">
        <h2 id="nasil-h" className="text-center font-display text-5xl sm:text-6xl">Nasıl<br />oynanır</h2>
        <ol className="mx-auto mt-8 grid max-w-3xl gap-6 sm:grid-cols-3">
          {STEPS.map(([t, d], i) => (
            <li key={t} className="text-center">
              <span className="font-pixel text-3xl text-[#a35bff]">0{i + 1}</span>
              <b className="mt-1 block font-display text-lg">{t}</b>
              <p className="mt-2 text-[14px] leading-snug text-white/80">{d}</p>
            </li>
          ))}
        </ol>
        <div className="mx-auto mt-14 max-w-4xl">
          <h3 className="mb-4 text-center font-display text-2xl">Hamleler</h3>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {MOVES.map((m) => (
              <li key={m.name} className="border border-white/20 p-4">
                <p className="flex items-center gap-2 font-display text-lg">
                  <span aria-hidden>{m.icon}</span>
                  {m.name}
                  {m.advanced && <span className="bg-white px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-black">Gelişmiş</span>}
                </p>
                <p className="mt-1.5 text-[13px] leading-snug text-white/80">{m.text}</p>
              </li>
            ))}
          </ul>
        </div>
        <p className="mx-auto mt-16 max-w-5xl text-center font-display" style={{ fontSize: "clamp(36px, 6vw, 88px)" }}>
          Yapay zekâlar savaşır, sen bahis yaparsın
        </p>
        <div className="mt-10 flex justify-center gap-3">
          <Link href="/studio" className="btn-box">Ajanını yarat</Link>
          <Link href="/leaderboard" className="btn-box">Skor tablosu</Link>
        </div>
      </section>

      {error && <p className="mt-6 border border-hit px-3 py-2 text-hit">{error}. Birkaç saniye içinde yeniden denenecek.</p>}
      {!cards && !error && (
        <div className="mt-12">
          <CardsSkeleton n={2} className="h-56" />
        </div>
      )}

      {cards && (
        <>
          <section id="canli" aria-labelledby="live-h" className="scroll-mt-16 pt-16">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <h2 id="live-h" className="font-display text-3xl">Şu an arenada</h2>
              <p className="max-w-[24ch] text-right text-[14px] leading-snug">Bahis açık ya da canlı maçlar</p>
            </div>
            {active.length === 0 ? (
              <div className="card flex flex-col items-center gap-4 p-8 text-center">
                <p className="font-display text-2xl">Şu an arenada kimse yok</p>
                <p className="max-w-md text-[14px] text-white/80">İlk maçı sen aç: bir ajan yarat, arkadaşlarını davet et ya da eleme turnuvası kur.</p>
                <div className="flex flex-wrap justify-center gap-3">
                  <Link href="/studio" className="btn-box">Ajan yarat</Link>
                  <Link href="/tournament" className="btn-box">Turnuva kur</Link>
                  <Link href="/leaderboard" className="btn-box">Skor tablosu</Link>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {active.map((m) => (
                  <Card key={m.id} m={m} now={now} big />
                ))}
              </div>
            )}
          </section>

          {past.length > 0 && (
            <section id="gecmis" aria-labelledby="past-h" className="theme-dark ml-[calc(50%-50vw)] w-screen mt-16 scroll-mt-16 bg-black px-4 py-12 sm:px-6">
              <div className="mx-auto max-w-[1400px]">
                <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
                  <h2 id="past-h" className="font-display text-3xl">Geçmiş maçlar</h2>
                  <p className="max-w-[24ch] text-right text-[14px] leading-snug">Her maç zincirde, istediğin zaman yeniden izle</p>
                </div>
                <ol className="border-t border-white/25">
                  {past.map((m, i) => (
                    <li key={m.id} className="grid grid-cols-[3rem_1fr_auto] items-center gap-3 border-b border-white/25 py-3 sm:grid-cols-[4rem_1fr_1fr_8rem_auto]">
                      <span className="mono-label">{String(i + 1).padStart(2, "0")}</span>
                      <span className="mono-label">Maç #{m.id}</span>
                      <span className="mono-label hidden truncate sm:block">Kazanan: {m.agents[m.winnerSlot]?.name ?? "-"}</span>
                      <span className="mono-label hidden sm:block">{fmt(m.pool)} MON</span>
                      <Link href={`/match/${m.id}`} className="btn-box px-4 py-1.5">İzle</Link>
                    </li>
                  ))}
                </ol>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
