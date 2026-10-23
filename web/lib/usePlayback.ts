"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MatchView } from "./useMatch";
import { buildFrame, cuesFor, DURATION, timeScale, type Frame } from "./playback";

// Oynatım temposu: 1x hızda bir tur yaklaşık 8 saniye sürer (zaman çizelgesi 3 saniye, 0,38 hızla oynatılır); 2x ve 4x bunu hızlandırır
const PACE = 0.38;
// Turlar arasında nefes payı: sonuç ve spiker cümlesi okunabilsin (hız düğmesiyle kısalır)
const GAP_MS = 2000;
import { buildFrame3D, type Frame3D } from "./playback3d";
import { play } from "./sfx";
import { MAX_HP } from "./arena";
import { commentary } from "./announcer";

/**
 * Biten turları sırayla sahneler. Maça yeni girildiğinde mevcut durumu doğrudan gösterir,
 * canlı maçta zincire düşen her yeni turu oynatır, "Tekrar oynat" ise baştan başlatır.
 */
export function usePlayback(view: MatchView | null, hold = false, mode: "2d" | "3d" = "2d") {
  const matchId = view?.id ?? null;
  const total = view?.history.length ?? 0;
  const [shown, setShown] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [t, setT] = useState(0);
  const [synced, setSynced] = useState<number | null>(null); // hangi maça atlandı
  const [shake, setShake] = useState({ id: 0, power: 0 });
  const fired = useRef({ key: "", n: 0 });
  const [announcement, setAnnouncement] = useState<{ text: string; key: string } | null>(null);
  const announcedKey = useRef("");
  const [finishedTick, setFinishedTick] = useState(0);
  const played = useRef(false); // bu maçta en az bir tur sahnelendi mi
  const prevShown = useRef(0);
  const raf = useRef(0);
  const speedRef = useRef(speed);
  useEffect(() => { speedRef.current = speed; }, [speed]); // animasyon döngüsü güncel hızı ref'ten okur

  // Başka bir maça geçince oynatma yapmadan güncel duruma atla
  useEffect(() => {
    if (matchId === null) return;
    if (synced !== matchId) {
      // Maç değişince oynatma durumu tek seferde sıfırlanır; bu bilinçli bir durum makinesi geçişidir
      /* eslint-disable react-hooks/set-state-in-effect */
      setSynced(matchId);
      setShown(total);
      setPlaying(false);
      played.current = false;
      announcedKey.current = "";
      setAnnouncement(null);
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [matchId, total, synced]);

  const log = view && synced === matchId && shown < total ? view.history[shown] : null;
  const hpBefore = useMemo(() => {
    if (!view) return [];
    return shown === 0 ? new Array(view.agents.length).fill(MAX_HP) : view.history[shown - 1].hpAfter;
  }, [view, shown]);

  // Sıradaki tur varsa oynat
  useEffect(() => {
    if (!log || hold) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- oynatılacak tur yoksa ya da bekletiliyorsa durum kapanır
      setPlaying(false);
      return;
    }
    setPlaying(true);
    played.current = true;
    const start = performance.now();
    let last = start;
    let elapsed = 0;
    let gapUntil = 0;
    const tick = (now: number) => {
      if (gapUntil) {
        // tur bitti, son kare ekranda kalır; ara dolunca sıradaki tura geçilir
        if (now < gapUntil) { raf.current = requestAnimationFrame(tick); return; }
        setT(0);
        setPlaying(false);
        setShown((s) => s + 1);
        return;
      }
      elapsed += (now - last) * speedRef.current * PACE * timeScale(log, elapsed);
      last = now;
      if (elapsed >= DURATION) {
        setT(DURATION - 1);
        gapUntil = now + GAP_MS / speedRef.current;
        raf.current = requestAnimationFrame(tick);
        return;
      }
      setT(elapsed);
      raf.current = requestAnimationFrame(tick);
    };
    setT(0);
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
    // log.round yeni tur başladığında değişir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, matchId, log?.round, !!log, hold]);

  // Zamanı gelen ses ve sarsıntı ipuçlarını tetikle
  useEffect(() => {
    if (!log || !playing) return;
    const key = `${matchId}:${shown}`;
    if (fired.current.key !== key) fired.current = { key, n: 0 };
    const cues = cuesFor(log);
    let power = 0;
    while (fired.current.n < cues.length && cues[fired.current.n].at <= t) {
      const c = cues[fired.current.n++];
      play(c.sound);
      power = Math.max(power, c.shake);
    }
    if (power > 0) setShake((s) => ({ id: s.id + 1, power }));
  }, [t, log, playing, matchId, shown]);

  // Spiker: vuruş anında turun yorumu belirir
  useEffect(() => {
    if (!view || !log || !playing || t < 1250) return;
    const key = `${matchId}:${shown}`;
    // Her karede (t değişince) setState çağırmamak için: aynı tur için yorum bir kez yazılır
    if (announcedKey.current === key) return;
    announcedKey.current = key;
    setAnnouncement({ key, text: commentary(log, view.agents.map((x) => x.name)) });
  }, [t, view, log, playing, matchId, shown]);

  // Maç sahnelenerek bittiğinde zafer sahnesini tetikle
  useEffect(() => {
    if (view && played.current && prevShown.current < total && shown >= total && view.match.phase === 3) setFinishedTick((c) => c + 1);
    prevShown.current = shown;
  }, [shown, total, view]);

  const names = useMemo(() => (view ? view.agents.map((a) => a.name) : []), [view]);
  const maxRounds = view?.match.maxRounds ?? 0;
  const frame: Frame | null = useMemo(() => {
    if (mode !== "2d" || !view || !log || !playing) return null;
    return buildFrame(log, hpBefore, names, t, { maxRounds });
  }, [mode, view, log, playing, hpBefore, names, t, maxRounds]);
  const frame3d: Frame3D | null = useMemo(() => {
    if (mode !== "3d" || !view || !log || !playing) return null;
    return buildFrame3D(log, hpBefore, names, t, { maxRounds });
  }, [mode, view, log, playing, hpBefore, names, t, maxRounds]);

  const replay = useCallback(() => {
    cancelAnimationFrame(raf.current);
    setPlaying(false);
    played.current = true;
    announcedKey.current = "";
    setShown(0);
  }, []);
  const skip = useCallback(() => {
    cancelAnimationFrame(raf.current);
    setPlaying(false);
    setShown(total);
  }, [total]);

  // Oynatma sürerken gösterilecek can: sahne içi akıcı değer, değilse son bilinen
  const staticHp = view ? (synced !== matchId || shown >= total ? view.hp : hpBefore) : [];

  return { frame, frame3d, shake, announcement, finishedTick, shown, total, playing, speed, setSpeed, replay, skip, hpBefore, staticHp, activeRound: log?.round ?? null };
}
