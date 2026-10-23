"use client";

import { useEffect, useMemo, useState } from "react";
import { simulate, syntheticView, type Spec } from "@/lib/sim";
import { usePlayback } from "@/lib/usePlayback";
import { GameStage } from "./GameStage";
import { GFX_LABEL, useGraphics } from "@/lib/useGraphics";
import { themeFor } from "@/lib/themes";
import { PRESETS } from "@/lib/presets";

// Antrenörler: biri saldırgan (Gladyatör), biri temkinli (Kale)
const SPARRING: Spec[] = PRESETS.filter((p) => p.name === "Gladyatör" || p.name === "Kale").map((p) => ({ ...p, name: `Antrenör ${p.name}` }));

/** Zincire yazmadan önce ajanı iki antrenörle denemek için: aynı kurallar, ücretsiz ve anında. */
export function Training({ agent }: { agent: Spec }) {
  const [tryNo, setTryNo] = useState(0);
  const specs = useMemo(() => [agent, ...SPARRING], [agent]);
  const sim = useMemo(() => simulate(specs, 8, tryNo), [specs, tryNo]);
  const view = useMemo(() => syntheticView(specs, sim.logs, sim.hp, sim.winner), [specs, sim]);
  const gfxState = useGraphics();
  const pb = usePlayback(view, false, gfxState.gfx === "2d" ? "2d" : "3d");

  // Ajan ya da deneme değişince maçı baştan oynat
  useEffect(() => {
    pb.replay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const won = sim.winner === 0;
  const out = sim.hp[0] === 0;
  return (
    <div className="flex flex-col gap-4">
      <GameStage
        quality="low"
        gfx={gfxState.gfx}
        agents={view.agents}
        hp={pb.staticHp}
        match={view.match}
        frame={pb.frame}
        frame3d={pb.frame3d}
        commits={view.commits}
        round={pb.activeRound ?? view.match.round}
        status={pb.playing ? "Antrenman maçı" : "Antrenman bitti"}
        settled={pb.shown >= pb.total}
        speaking={[]}
        theme={themeFor(tryNo)}
        shake={pb.shake}
      />
      <div aria-live="polite" className="min-h-[3rem] rounded-xl border border-line bg-deep/60 px-4 py-3 text-sm">
        {pb.announcement ? <p key={pb.announcement.key} className="say-in"><b className="mr-2 text-monad">Spiker</b>{pb.announcement.text}</p> : <p className="text-mute">Antrenman başlayınca spiker yorum yapar.</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button type="button" onClick={() => setTryNo((n) => n + 1)} className="rounded-md bg-monad/20 px-3 py-1.5 font-medium hover:bg-monad/30">
          Yeni antrenman maçı
        </button>
        <button type="button" onClick={gfxState.cycle} className="rounded-md border border-line px-3 py-1.5 text-mute hover:border-mute hover:text-chalk">{GFX_LABEL[gfxState.gfx]}</button>
        {pb.playing && <button type="button" onClick={pb.skip} className="rounded-md border border-line px-3 py-1.5 hover:border-mute">Sona atla</button>}
        {!pb.playing && pb.total > 0 && (
          <p className="text-chalk/85">
            {won ? `${agent.name} antrenmanı kazandı.` : out ? `${agent.name} elendi.` : `${agent.name} ayakta kaldı ama kazanamadı.`} {pb.total} turda {sim.hp[0]}/10 canla bitti.
          </p>
        )}
      </div>
      <p className="text-xs text-mute">
        Antrenman, yazdığın kişilik ve stratejideki anahtar kelimelerden (saldır, savun, ittifak, ihanet gibi) hamle eğilimi çıkarır. Gerçek maçta ajanın beyni (yapay zeka) kararı kendisi verir.
      </p>
    </div>
  );
}
