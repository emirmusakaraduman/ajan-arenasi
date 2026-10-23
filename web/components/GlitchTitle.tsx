"use client";

import { useEffect, useState } from "react";

type Hole = { x: number; y: number; w: number; h: number; color: string };

/**
 * Piksel bozulmalı başlık: harflerin üstünde mor "delikler" ve beyaz piksel parçaları sürekli yer değiştirir,
 * arada bir yatay dilimler kayar (glitch). Hareket azaltma tercihinde durağan kalır.
 */
export function GlitchTitle({ lines, id }: { lines: string[]; id?: string }) {
  const [holes, setHoles] = useState<Hole[]>([]);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const make = () =>
      Array.from({ length: 90 }, () => {
        const w = 0.8 + Math.random() * 2.2, h = 3 + Math.random() * 11;
        const r = Math.random();
        // çoğu mor delik (harfi oyar), bir kısmı beyaz kırıntı, az bir kısmı siyah piksel
        return { x: Math.random() * (100 - w), y: Math.random() * (100 - h), w, h, color: r < 0.62 ? "var(--ink)" : r < 0.9 ? "#fff" : "#000" };
      });
    setHoles(make());
    const t = setInterval(() => setHoles(make()), 65);
    return () => clearInterval(t);
  }, []);
  const text = lines.join("\n");
  return (
    <h1 id={id} aria-label={lines.join(" ")} className="glitch relative inline-block overflow-hidden whitespace-pre-line font-pixel text-white" data-text={text}
      style={{ fontSize: "clamp(56px, 12vw, 176px)" }}>
      <span aria-hidden>{text}</span>
      <span aria-hidden className="pointer-events-none absolute inset-0">
        {holes.map((h, i) => (
          <span key={i} className="absolute" style={{ left: `${h.x}%`, top: `${h.y}%`, width: `${h.w}%`, height: `${h.h}%`, background: h.color }} />
        ))}
      </span>
    </h1>
  );
}
