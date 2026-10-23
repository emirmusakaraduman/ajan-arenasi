import type { MutableRefObject } from "react";
import type { Frame3D } from "@/lib/playback3d";

/** Sahne bileşenlerinin her karede okuduğu paylaşılan durum: React'i yeniden çizdirmeden animasyon sürer. */
export type Live = {
  frame: Frame3D | null;
  hp: number[];            // oynatma yokken gösterilecek can
  names: string[];
  n: number;
  finished: boolean;       // maç bitti ve oynatma da bitti
  winnerSlot: number;
  phase: number;           // 1 bahis, 2 canlı, 3 bitti
  commits: boolean[];
  speaking: number[];
  shake: { id: number; power: number };
  tags: (HTMLDivElement | null)[]; // ad etiketleri (ekran katmanı, her karede konumlanır)
  nums: (HTMLDivElement | null)[]; // uçan hasar sayıları
};

export type LiveRef = MutableRefObject<Live>;

export const emptyLive = (): Live => ({
  frame: null, hp: [], names: [], n: 0, finished: false, winnerSlot: 0, phase: 1, commits: [], speaking: [], shake: { id: 0, power: 0 }, tags: [], nums: [],
});
