"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { fmt } from "@/lib/arena";
import { useMatch } from "@/lib/useMatch";
import { useWallet } from "@/lib/wallet";
import { usePlayback } from "@/lib/usePlayback";
import { setMusicIntensity } from "@/lib/sfx";
import { GameStage } from "./GameStage";
import { GFX_LABEL, useGraphics } from "@/lib/useGraphics";
import { Feed } from "./Feed";
import { BetPanel, ClaimBanner } from "./BetPanel";
import { MatchSkeleton } from "./Skeletons";
import { MatchSummary } from "./MatchSummary";
import { favoriteSlot, fmtMult, multiplier } from "@/lib/odds";
import { slotColor } from "@/lib/playback";
import { ChatStrip } from "./ChatStrip";
import { CreatePanel } from "./CreatePanel";
import { Intro } from "./Intro";
import { Victory } from "./Victory";
import { ReactionBar, ReactionOverlay } from "./ReactionBar";
import { useReactions } from "@/lib/useReactions";
import { themeFor } from "@/lib/themes";
import { announce, stopAnnouncing } from "@/lib/voice";

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(s % 60, 0)).padStart(2, "0")}`;

/** Bir maçın tam ekranı: sahne, tanıtım, spiker, bahis ve akış. */
export function MatchScreen({ matchId }: { matchId: number }) {
  // Kullanıcı seçene kadar sekme türetilir: bahis açıksa Bahis, değilse Canlı akış
  const [picked, setPicked] = useState<"bet" | "feed" | "create" | null>(null);
  const [now, setNow] = useState(0);
  const [intro, setIntro] = useState(false);
  const [victory, setVictory] = useState(false);
  const [voice, setVoice] = useState(false);
  const [copied, setCopied] = useState<"" | "invite" | "replay">("");
  const wantReplay = useSearchParams().get("replay") === "1"; // "Tekrarı paylaş" bağlantısı: açılınca maç baştan oynar
  const autoReplayed = useRef(false);
  const wallet = useWallet();
  const { view, error, reload } = useMatch(matchId, wallet.address);
  const gfxState = useGraphics();
  const reactions = useReactions(matchId);
  const pb = usePlayback(view, intro, gfxState.gfx === "2d" ? "2d" : "3d");
  const prev = useRef<{ phase: number; first: boolean } | null>(null);

  useEffect(() => {
    setNow(Math.floor(Date.now() / 1000));
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    try { setVoice(window.localStorage.getItem("arena-voice") === "1"); } catch {}
    return () => clearInterval(t);
  }, []);

  // Maç canlıya geçince (ya da canlı maça ilk girişte) tanıtım oynar
  useEffect(() => {
    if (!view) return;
    const p = prev.current;
    if ((p && p.phase === 1 && view.match.phase === 2) || (!p && view.match.phase === 2 && view.history.length === 0)) setIntro(true);
    prev.current = { phase: view.match.phase, first: false };
  }, [view]);

  useEffect(() => { if (pb.finishedTick > 0) setVictory(true); }, [pb.finishedTick]);

  // ?replay=1 ile açılan bitmiş maç, tanıtımla birlikte baştan oynar (bir kez)
  const replay = pb.replay;
  useEffect(() => {
    if (!wantReplay || autoReplayed.current || !view || view.match.phase !== 3 || pb.total === 0) return;
    autoReplayed.current = true;
    setIntro(true);
    replay();
  }, [wantReplay, view, pb.total, replay]);

  // Dövüş sürerken müzik hızlanır
  useEffect(() => {
    setMusicIntensity(pb.playing ? 1 : 0.35);
    return () => setMusicIntensity(0.35);
  }, [pb.playing]);

  // Spiker sesi (tarayıcının Türkçe sesi varsa)
  useEffect(() => {
    if (!voice || !pb.announcement || typeof window === "undefined" || !window.speechSynthesis) return;
    announce(pb.announcement.text);
  }, [pb.announcement?.key, voice]); // eslint-disable-line react-hooks/exhaustive-deps

  const endIntro = useCallback(() => setIntro(false), []);
  const endVictory = useCallback(() => setVictory(false), []);
  const busy = wallet.tx.status === "wallet" || wallet.tx.status === "pending";

  const chat = !view ? [] : pb.playing && pb.activeRound !== null ? (view.messages[pb.activeRound] ?? []) : view.match.phase === 2 ? view.live : [];

  let status = "";
  let live: string | null = null;
  if (view) {
    const { match, hp, commits, revealed, agents } = view;
    const alive = hp.filter((h) => h > 0).length;
    if (match.phase === 1) {
      status = now < match.bettingEnd ? `Bahis kapanmasına ${clock(match.bettingEnd - now)}` : "Bahis kapandı, maç başlıyor";
      live = status;
    } else if (match.phase === 2) {
      const locked = commits.filter(Boolean).length;
      const opened = revealed.filter((m) => m.submitted).length;
      if (locked < alive && now < match.commitDeadline) status = `Hamleler kilitleniyor ${locked}/${alive}`;
      else if (opened < alive && now < match.revealDeadline) status = `Hamleler açılıyor ${opened}/${alive}`;
      else status = "Tur çözülüyor";
      live = `Tur ${match.round + 1}: ${status.toLocaleLowerCase("tr-TR")}. Hamleler açılana kadar kimse rakibinin hamlesini göremez.`;
    } else {
      status = `Kazanan ${agents[match.winnerSlot]?.name}`;
    }
  }

  /** Davet: açık maç bağlantısı. Tekrar: bitmiş maçı baştan oynatan bağlantı; telefonda sistem paylaşım menüsü açılır */
  const share = async (kind: "invite" | "replay") => {
    const url = `${window.location.origin}/match/${matchId}${kind === "replay" ? "?replay=1" : ""}`;
    const names = view?.agents.map((a) => a.name).join(" vs ") ?? "";
    try {
      if (kind === "replay" && navigator.share) {
        await navigator.share({ title: `Maç #${matchId}: ${names}`, text: view?.match.phase === 3 ? `Kazanan ${view.agents[view.match.winnerSlot]?.name}. Tekrarı izle!` : "", url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(kind);
      setTimeout(() => setCopied(""), 2000);
    } catch {}
  };

  if (error && !view) return <p className="rounded-lg bg-hit/15 px-3 py-2 text-sm text-hit">{error}. Birkaç saniye içinde yeniden denenecek.</p>;
  if (!view) return <MatchSkeleton />;
  const tab = picked ?? (view.match.phase === 1 ? "bet" : "feed");

  const btn = "rounded-md border border-line px-3 py-1.5 hover:border-mute";
  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3 text-sm">
        <Link href={`/match/${Math.max(view.id - 1, 1)}`} aria-label="Önceki maç" aria-disabled={view.id <= 1} className={`${btn} ${view.id <= 1 ? "pointer-events-none opacity-40" : ""}`}>‹</Link>
        <h1 className="font-display text-lg font-medium">Maç #{view.id}</h1>
        <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-mute">Arena: {themeFor(view.id).name}</span>
        <Link href={`/match/${Math.min(view.id + 1, view.count)}`} aria-label="Sonraki maç" aria-disabled={view.id >= view.count} className={`${btn} ${view.id >= view.count ? "pointer-events-none opacity-40" : ""}`}>›</Link>
        <button type="button" onClick={() => share("invite")} className={`${btn} ml-2`}>{copied === "invite" ? "Bağlantı kopyalandı" : "Arkadaşını davet et"}</button>
        {view.match.phase === 3 && (
          <button type="button" onClick={() => share("replay")} className={btn}>{copied === "replay" ? "Tekrar bağlantısı kopyalandı" : "Tekrarı paylaş"}</button>
        )}
        <span className="ml-auto text-mute">
          Havuz <b className="text-base font-bold text-gold">{fmt(view.match.pool)}</b> MON
        </span>
      </div>
      {error && <p className="mb-4 rounded-lg bg-hit/15 px-3 py-2 text-sm text-hit">{error}. Birkaç saniye içinde yeniden denenecek.</p>}

      <main className="grid gap-8 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <div className="relative">
            <div
              className={pb.shake.id === 0 ? "" : pb.shake.id % 2 ? "stage-shake-a" : "stage-shake-b"}
              style={{ "--p": pb.shake.power } as React.CSSProperties}
            >
              <GameStage
                gfx={gfxState.gfx}
                agents={view.agents}
                hp={pb.staticHp}
                match={view.match}
                frame={pb.frame}
                frame3d={pb.frame3d}
                commits={view.commits}
                round={pb.activeRound ?? view.match.round}
                status={pb.shown < pb.total && view.match.phase === 3 ? "Maç tekrarı" : status}
                settled={pb.shown >= pb.total}
                speaking={chat.map((m) => m.slot)}
                theme={themeFor(view.id)}
                shake={pb.shake}
              />
            </div>
            <ReactionOverlay floating={reactions.floating} />
            {intro && <Intro agents={view.agents} matchId={view.id} onDone={endIntro} />}
            {victory && !intro && (
              <Victory winner={view.agents[view.match.winnerSlot]} slot={view.match.winnerSlot} pool={fmt(view.match.pool)} onDone={endVictory} />
            )}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
            {pb.playing ? (
              <button type="button" onClick={pb.skip} className={btn}>Sona atla</button>
            ) : (
              pb.total > 0 && (
                <button type="button" onClick={() => { setIntro(true); pb.replay(); }} className="rounded-md bg-monad/20 px-3 py-1.5 font-medium hover:bg-monad/30">
                  Maçı baştan oynat
                </button>
              )
            )}
            {pb.total > 0 && (
              <div role="group" aria-label="Oynatma hızı" className="flex overflow-hidden rounded-md border border-line">
                {[1, 2, 4].map((v) => (
                  <button key={v} type="button" aria-pressed={pb.speed === v} onClick={() => pb.setSpeed(v)}
                    className={`px-2.5 py-1.5 ${pb.speed === v ? "bg-monad/30 text-chalk" : "text-mute hover:text-chalk"}`}>
                    {v}x
                  </button>
                ))}
              </div>
            )}
            <button type="button" className={`${btn} text-mute hover:text-chalk`} onClick={gfxState.cycle}>
              {GFX_LABEL[gfxState.gfx]}
            </button>
            <button type="button" aria-pressed={voice} className={`${btn} ${voice ? "text-chalk" : "text-mute"}`}
              onClick={() => { const v = !voice; setVoice(v); try { window.localStorage.setItem("arena-voice", v ? "1" : "0"); } catch {} if (!v) stopAnnouncing(); }}>
              {voice ? "Spiker sesi açık" : "Spiker sesi kapalı"}
            </button>
          </div>

          <ReactionBar counts={reactions.counts} onSend={reactions.send} />

          <div aria-live="polite" className="min-h-[3.25rem] rounded-xl border border-line bg-deep/60 px-4 py-3 text-sm leading-snug">
            {pb.announcement ? (
              <p key={pb.announcement.key} className="say-in">
                <b className="mr-2 text-monad">Spiker</b>
                {pb.announcement.text}
              </p>
            ) : (
              <p className="text-mute">Spiker, turlar oynanırken burada yorum yapar.</p>
            )}
          </div>

          {/* Başlatma ve tur ilerletme izinsizdir: ajan süreci çalışmıyorsa herkes buradan yapabilir */}
          {((view.match.phase === 1 && now >= view.match.bettingEnd) || (view.match.phase === 2 && now >= view.match.revealDeadline)) && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-monad/60 bg-monad/10 px-4 py-3 text-sm">
              <p className="flex-1">
                {view.match.phase === 1
                  ? "Bahis süresi bitti. Maçı başlatmak için bir işlem gönder."
                  : "Tur süresi doldu. Turu çözmek için bir işlem gönder; hamle göndermeyen ajanlar savunmasız sayılır."}
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  if (!wallet.address) { await wallet.connect(); return; }
                  if (await wallet.send(view.match.phase === 1 ? "startMatch" : "resolveRound", [BigInt(view.id)])) reload();
                }}
                className="rounded-lg bg-monad px-4 py-2 font-bold text-on-monad transition-colors hover:bg-monad/85 disabled:opacity-50"
              >
                {!wallet.address ? "Cüzdanı bağla" : view.match.phase === 1 ? "Maçı başlat" : "Turu ilerlet"}
              </button>
            </div>
          )}

          <ChatStrip agents={view.agents} messages={chat} />

          {/* Oran şeridi: bahis panelinde hangi sekme açık olursa olsun çarpanlar hep göz önünde */}
          {view.match.pool > BigInt(0) && view.match.phase !== 3 && (
            <ul aria-label="Güncel oranlar" className="flex flex-wrap gap-2">
              {view.agents.map((a, i) => {
                const m = multiplier(view.match.pool, view.stakes[i]);
                const fav = favoriteSlot(view.stakes) === i;
                return (
                  <li key={i} className="card flex items-center gap-2 px-3 py-1.5 text-sm" style={{ borderLeft: `4px solid ${slotColor(i, 55)}` }}>
                    <span className="truncate">{a.name}</span>
                    <b className={`font-display text-lg ${fav ? "text-gold" : ""}`}>{m ? fmtMult(m) : "–"}</b>
                    {fav && <span className="bg-gold px-1 text-[10px] font-bold uppercase text-black">Favori</span>}
                  </li>
                );
              })}
            </ul>
          )}

          {view.match.phase === 3 && pb.shown >= pb.total && <MatchSummary view={view} />}
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
          <ClaimBanner view={view} busy={busy} onClaim={async () => { if (await wallet.send("claim", [BigInt(view.id)])) reload(); }} />
          <div role="tablist" className="flex gap-1 border-b border-line">
            {([["bet", "Bahis"], ["feed", "Canlı akış"], ["create", "Ajan ve maç"]] as const).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setPicked(k)}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === k ? "border-monad text-chalk" : "border-transparent text-mute hover:text-chalk"}`}>
                {l}
              </button>
            ))}
          </div>
          <div className="max-h-[75vh] overflow-y-auto pr-1">
            {tab === "bet" ? (
              <BetPanel
                view={view}
                now={now}
                connected={!!wallet.address}
                busy={busy}
                onBet={async (slot, amount) => { if (await wallet.send("bet", [BigInt(view.id), slot], amount)) reload(); }}
              />
            ) : tab === "feed" ? (
              <Feed agents={view.agents} history={view.history.slice(0, pb.shown)} messages={view.messages} live={live} matchId={view.id} phase={view.match.phase} />
            ) : (
              <CreatePanel address={wallet.address} busy={busy} send={(fn, args) => wallet.send(fn, args)} onCreated={reload} />
            )}
          </div>
        </aside>
      </main>
    </>
  );
}
