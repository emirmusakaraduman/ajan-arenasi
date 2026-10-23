"use client";

import { useCallback, useEffect, useState } from "react";

export type Gfx = "3d" | "2d";
const KEY = "arena-gfx";
const ORDER: Gfx[] = ["3d", "2d"];
export const GFX_LABEL: Record<Gfx, string> = { "3d": "Grafik: 3B", "2d": "Grafik: 2B" };

function webglOk() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Grafik modu: cihaz WebGL destekliyorsa 3B, yoksa 2B. Seçim hatırlanır. Kalite, kare hızına göre kendiliğinden ayarlanır. */
export function useGraphics() {
  const [gfx, setGfx] = useState<Gfx>("3d");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let saved: string | null = null;
    try { saved = window.localStorage.getItem(KEY); } catch {}
    const ok = webglOk();
    // Eski kayıtlar ("3d-high", "3d-low") tek 3B moda taşınır
    const pref = saved === "2d" ? "2d" : "3d";
    const pick: Gfx = !ok ? "2d" : pref;
    setGfx(pick);
    setReady(true);
  }, []);
  const cycle = useCallback(() => {
    setGfx((g) => {
      const next = ORDER[(ORDER.indexOf(g) + 1) % ORDER.length];
      try { window.localStorage.setItem(KEY, next); } catch {}
      return next;
    });
  }, []);
  return { gfx, cycle, ready };
}
