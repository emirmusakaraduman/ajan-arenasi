"use client";

import dynamic from "next/dynamic";
import type { Agent, MatchInfo } from "@/lib/useMatch";
import type { Frame } from "@/lib/playback";
import type { Frame3D } from "@/lib/playback3d";
import type { Theme } from "@/lib/themes";
import type { Gfx } from "@/lib/useGraphics";
import { Stage } from "./Stage";

const Stage3D = dynamic(() => import("./Stage3D"), {
  ssr: false,
  loading: () => (
    <div className="grid aspect-[16/10] w-full place-items-center rounded-2xl bg-deep/60 text-sm text-mute max-sm:aspect-[4/5]">3B arena hazırlanıyor…</div>
  ),
});

type Props = {
  gfx: Gfx;
  agents: Agent[];
  hp: number[];
  match: MatchInfo;
  frame: Frame | null;
  frame3d: Frame3D | null;
  commits: boolean[];
  round: number;
  status: string;
  settled: boolean;
  speaking: number[];
  theme: Theme;
  shake: { id: number; power: number };
  /** "low": son işlem efektleri hafif (stüdyo antrenmanı gibi sayfanın asıl işi olmayan yerler) */
  quality?: "high" | "low";
};

/** Cihaza ve seçime göre 3B ya da 2B sahne. */
export function GameStage({ gfx, frame, frame3d, shake, quality = "high", ...rest }: Props) {
  // Sahne her temada koyu kalır: içindeki etiket ve göstergeler koyu belirteçlerle çizilir
  return (
    <div className="theme-dark">
      {gfx === "2d" ? <Stage {...rest} frame={frame} /> : <Stage3D {...rest} frame={frame3d} shake={shake} quality={quality} />}
    </div>
  );
}
