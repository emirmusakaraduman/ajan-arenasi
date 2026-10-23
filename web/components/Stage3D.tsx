"use client";

import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { BrightnessContrast, Bloom, ChromaticAberration, EffectComposer, HueSaturation, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ContactShadows, PerformanceMonitor } from "@react-three/drei";
import { BlendFunction, ToneMappingMode } from "postprocessing";
import * as THREE from "three";
import type { Agent, MatchInfo } from "@/lib/useMatch";
import type { Frame3D } from "@/lib/playback3d";
import { THEMES, type Theme } from "@/lib/themes";
import { Arena3D } from "./three/Arena3D";
import { Fighter3D } from "./three/Fighter3D";
import { Effects3D } from "./three/Effects3D";
import { FxLayer, SeeFx } from "./three/FxLayer";
import { emptyLive, type LiveRef } from "./three/live";
import { lookOf } from "./Fighter";
import { HUES } from "@/lib/playback";
import { slotPos3 } from "@/lib/playback3d";
import { HudBar } from "./HudBar";

const INTENT_ICON = {
  sword: { color: "#ff5d73", glyph: "⚔" },
  shield: { color: "#5b9bff", glyph: "⛨" },
  heart: { color: "#2fbf8f", glyph: "♥" },
  idle: { color: "#59618f", glyph: "…" },
  steal: { color: "#f59e0b", glyph: "✋" },
  charge: { color: "#ff9a4d", glyph: "⚡" },
  pact: { color: "#4be3b0", glyph: "🤝" },
} as const;
const TONE = { hit: "#ff5d73", gold: "#ffcf5c", ally: "#4be3b0", mute: "#c9cffa" } as const;

type Props = {
  agents: Agent[];
  hp: number[];
  match: MatchInfo;
  frame: Frame3D | null;
  commits: boolean[];
  round: number;
  status: string;
  settled: boolean;
  speaking: number[];
  theme?: Theme;
  shake?: { id: number; power: number };
  quality?: "high" | "low";
};

/** Kamera: önemli olaya yaklaşır, boştayken usulca salınır, vuruşlarda sarsılır. */
function Rig({ live }: { live: LiveRef }) {
  const { camera, size } = useThree();
  const energy = useRef({ id: 0, e: 0 });
  const tgt = useMemo(() => new THREE.Vector3(), []);
  // Kamera nesnesi her karede imperatif güncellenir (R3F'in tasarımı)
  /* eslint-disable react-hooks/immutability */
  useFrame((state, dt) => {
    const L = live.current;
    const t = state.clock.elapsedTime;
    const cam = camera as THREE.PerspectiveCamera;
    const aspect = size.width / Math.max(size.height, 1);
    const fov = aspect >= 1.55 ? 36 : Math.min(36 * Math.pow(1.55 / aspect, 0.72), 70);
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    const c = L.frame?.camera ?? { x: 0, y: 0.95, z: 0, zoom: 1, orbit: 0 };
    if (L.shake.id !== energy.current.id) energy.current = { id: L.shake.id, e: L.shake.power };
    energy.current.e *= Math.exp(-dt * 6);
    const e = energy.current.e;
    const drift = Math.sin(t * 0.22) * 0.1 + c.orbit;
    const dist = (1 / c.zoom) * (aspect >= 1.55 ? 1 : 1.1);
    const ox = Math.sin(drift) * 9.9 * dist;
    const oz = Math.cos(drift) * 9.9 * dist;
    tgt.set(c.x, c.y, c.z);
    cam.position.set(
      c.x + ox + Math.sin(t * 53) * 0.05 * e,
      c.y + (4.0 + Math.sin(t * 0.3) * 0.15) * dist + Math.sin(t * 61) * 0.05 * e,
      c.z + oz,
    );
    cam.lookAt(tgt);
    cam.rotation.z += Math.sin(t * 47) * 0.012 * e;
  });
  /* eslint-enable react-hooks/immutability */
  return null;
}
/** Ad etiketlerini karakterlerin kafasının üstüne, ekran katmanında konumlar. */
const HEAD = [2.1, 2.3, 2.0]; // gövde tipine göre baş üstü yüksekliği (metre)
function Labels({ live }: { live: LiveRef }) {
  const { camera, size } = useThree();
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const L = live.current;
    const n = Math.max(L.n, 1);
    L.tags.forEach((el, i) => {
      if (!el) return;
      const A = L.frame?.agents[i];
      const home = slotPos3(i, n);
      const body = lookOf(L.names[i] ?? "").body;
      v.set(A ? A.x : home.x, HEAD[body] + 0.35, A ? A.z : home.z).project(camera);
      el.style.transform = `translate(${(v.x * 0.5 + 0.5) * size.width}px, ${(-v.y * 0.5 + 0.5) * size.height}px) translate(-50%, -100%)`;
      el.style.visibility = v.z > 1 ? "hidden" : "visible";
    });
  });
  return null;
}

// Her render'da yeni nesne vermemek için sabit: efekt her karede yeniden kurulmasın
const CA_OFFSET = new THREE.Vector2(0, 0);

/** Vuruşlarda ekran kenarında renk ayrışması (chromatic aberration) */
function PostFX({ live, quality }: { live: LiveRef; quality: "high" | "low" }) {
  const ca = useRef<{ offset: THREE.Vector2 } | null>(null);
  useFrame(() => {
    const h = live.current.frame?.hitPulse ?? 0;
    ca.current?.offset.set(h * 0.006, h * 0.004);
  });
  return (
    <EffectComposer multisampling={quality === "high" ? 8 : 0} enableNormalPass={false}>
      {/* Ortam gölgelendirme (AO) kullanılmaz: düz zeminde karakterlerin çevresinde siyah, tırtıklı lekeler bırakıyordu */}
      <Bloom intensity={0.75} luminanceThreshold={0.8} luminanceSmoothing={0.25} mipmapBlur radius={0.78} />
      <ChromaticAberration ref={ca as never} offset={CA_OFFSET} radialModulation={false} modulationOffset={0} blendFunction={BlendFunction.NORMAL} />
      <HueSaturation saturation={0.14} />
      <BrightnessContrast contrast={0.1} brightness={0.0} />
      {/* Film greni (Noise, soft light) kullanılmaz: doygun renklerde geçersiz piksel üretip zeminde kesik kesik siyah izler bırakıyordu */}
      <Vignette offset={0.28} darkness={0.72} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}

export default function Stage3D({ agents, hp, match, frame, commits, round, status, settled, speaking, theme = THEMES[0], shake = { id: 0, power: 0 }, quality = "high" }: Props) {
  const live = useRef(emptyLive());
  const [perf, setPerf] = useState(1); // kare hızı düşerse çözünürlük kendiliğinden azalır
  const onDecline = useCallback(() => setPerf(0.62), []);
  const onIncline = useCallback(() => setPerf(1), []);
  const finished = match.phase === 3 && settled && !frame;
  // Üç boyutlu sahne bu "canlı" nesneyi her karede okur. Render sırasında değil, DOM'a işlendikten sonra güncellenir;
  // etiket ve sayı düğümleri (tags, nums) ref'lerle ayrıca doldurulduğu için korunur.
  useLayoutEffect(() => {
    Object.assign(live.current, {
      frame,
      hp,
      names: agents.map((a) => a.name),
      n: agents.length,
      finished,
      winnerSlot: match.winnerSlot,
      phase: match.phase,
      commits,
      speaking,
      shake,
    });
  });
  const hudHp = frame ? frame.agents.map((a) => a.hp) : hp;
  const cap = frame?.caption;
  const title = frame?.title;
  const vig = frame?.vignette;

  // WebGL bağlamı kaybolursa sayfa yenilenmeden kurtar
  const canvasRef = useRef<HTMLDivElement>(null);
  // Sahne ekranda değilse ya da sekme arka plandaysa çizim durur, böylece sayfanın geri kalanı (menü, tıklamalar) beklemez
  const [onScreen, setOnScreen] = useState(true);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    let inView = true;
    const update = () => setOnScreen(inView && document.visibilityState === "visible");
    const io = new IntersectionObserver(([e]) => { inView = e.isIntersecting; update(); });
    io.observe(el);
    document.addEventListener("visibilitychange", update);
    return () => { io.disconnect(); document.removeEventListener("visibilitychange", update); };
  }, []);
  useEffect(() => {
    const el = canvasRef.current?.querySelector("canvas");
    if (!el) return;
    const prevent = (e: Event) => e.preventDefault();
    el.addEventListener("webglcontextlost", prevent);
    return () => el.removeEventListener("webglcontextlost", prevent);
  }, []);

  return (
    <div>
      <HudBar agents={agents} hp={hudHp} finished={finished} winnerSlot={match.winnerSlot} />
      <div ref={canvasRef} className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl bg-ink max-sm:aspect-[4/5]" style={{ boxShadow: "0 0 0 1px rgba(255,255,255,.06), 0 24px 60px rgba(0,0,0,.45)" }}>
        <Canvas
          shadows
          dpr={[1, (quality === "high" ? 2 : 1.25) * perf]}
          frameloop={onScreen ? "always" : "never"}
          camera={{ fov: 36, position: [0, 4.2, 9.8], near: 0.1, far: 90 }}
          gl={{ antialias: false, powerPreference: "high-performance", alpha: false }}
          style={{ position: "absolute", inset: 0 }}
          aria-label={`Arena: ${agents.map((a, i) => `${a.name} ${Math.round(hp[i] ?? 0)} can`).join(", ")}`}
        >
          <Suspense fallback={null}>
            <PerformanceMonitor onDecline={onDecline} onIncline={onIncline} flipflops={3} />
            <Arena3D key={theme.key} theme={theme} live={live} />
            <ContactShadows position={[0, 0.015, 0]} opacity={0.62} scale={16} blur={2.2} far={2.4} resolution={quality === "high" ? 1024 : 512} color="#05071a" />
            {agents.map((a, i) => (
              <Fighter3D key={`${i}-${a.name}`} index={i} name={a.name} live={live} />
            ))}
            <FxLayer>
              <Effects3D live={live} />
            </FxLayer>
            <SeeFx />
            <Labels live={live} />
            <Rig live={live} />
            <PostFX live={live} quality={quality} />
          </Suspense>
        </Canvas>

        {/* Ekran katmanı: ad etiketleri, hamle rozetleri ve uçan sayılar */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {agents.map((a, i) => {
            const fa = frame?.agents[i];
            const dead = (fa ? fa.hp : hp[i] ?? 10) <= 0.01;
            const icon = fa?.intent ? INTENT_ICON[fa.intent] : null;
            return (
              <div key={i} ref={(el) => { (live.current.tags ??= [])[i] = el; }} className="absolute left-0 top-0 will-change-transform" style={{ opacity: dead ? 0.35 : 1 }}>
                <div className="flex flex-col items-center gap-1.5">
                  <div className="grid h-7 w-7 place-items-center rounded-full border-[2.5px] border-ink text-sm font-bold text-white shadow-md" style={{ opacity: fa?.intentAlpha ?? 0, background: icon?.color ?? "transparent" }}>
                    {icon?.glyph}
                  </div>
                  {!dead && (
                    <div className="flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold text-chalk sm:text-[13px]" style={{ background: "rgba(13,19,48,.82)", border: `2px solid hsl(${HUES[i % HUES.length]} 55% 62%)` }}>
                      {speaking.includes(i) && <span title="Konuştu">💬</span>}
                      {a.name}
                      {!frame && match.phase === 2 && commits[i] && <span title="Hamle kilitlendi">🔒</span>}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {[0, 1, 2].map((i) => (
            <div key={i} ref={(el) => { (live.current.nums ??= [])[i] = el; }} className="absolute left-0 top-0 whitespace-nowrap font-display text-4xl font-bold will-change-transform" style={{ opacity: 0, textShadow: "0 3px 0 #0d1330, 2px 2px 0 #0d1330, -2px -2px 0 #0d1330, 0 0 14px rgba(0,0,0,.5)" }} />
          ))}
        </div>

        {/* Üst katman: tur ve durum, başlık, çizgi roman bandı, vuruş kararması */}
        <div className="pointer-events-none absolute left-3 top-3 rounded-lg bg-ink/70 px-3 py-1.5 backdrop-blur-sm">
          <p className="font-display text-sm font-medium leading-tight">
            {match.phase === 1 ? "Bahis" : finished ? "Bitti" : `Tur ${Math.min(round + 1, match.maxRounds)}`}
          </p>
          <p className="text-xs text-chalk/75">{status}</p>
        </div>
        {cap && cap.alpha > 0.01 && (
          <div className="pointer-events-none absolute left-1/2 top-16 w-[88%] max-w-[560px]" style={{ opacity: cap.alpha, transform: `translateX(-50%) rotate(-1.5deg) scale(${0.92 + 0.08 * cap.alpha})` }}>
            <p className="rounded-xl border-[3px] bg-ink/90 px-4 py-2.5 text-center font-display text-sm font-bold sm:text-lg" style={{ borderColor: TONE[cap.tone], color: TONE[cap.tone], boxShadow: "0 10px 30px rgba(0,0,0,.45)" }}>
              {cap.text}
            </p>
          </div>
        )}
        {title && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center" style={{ opacity: title.alpha }}>
            <p className="font-display text-5xl font-bold text-white sm:text-7xl" style={{ transform: `scale(${title.scale})`, textShadow: "0 6px 0 #0d1330, 0 0 40px rgba(131,110,249,.7)" }}>
              {title.text}
            </p>
          </div>
        )}
        {vig && <div className="pointer-events-none absolute inset-0" style={{ opacity: vig.alpha, background: `radial-gradient(ellipse at center, transparent 35%, ${vig.color} 100%)` }} />}
      </div>
    </div>
  );
}
