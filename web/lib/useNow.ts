"use client";

import { useSyncExternalStore } from "react";

/**
 * Saniyelik "şimdi" (unix saniye). Sunucuda ve ilk istemci çiziminde 0'dır (hidrasyon uyuşmazlığı olmasın),
 * ardından her saniye güncellenir. Bileşenler `now` için kendi interval + setState'lerini yazmak zorunda kalmaz.
 */
let now = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

const tick = () => {
  now = Math.floor(Date.now() / 1000);
  listeners.forEach((l) => l());
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    tick();
    timer = setInterval(tick, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export function useNow(): number {
  return useSyncExternalStore(subscribe, () => now, () => 0);
}
