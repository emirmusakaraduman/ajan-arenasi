"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { lookOf } from "../Fighter";
import { HUES } from "@/lib/playback";
import { centerYaw, slotPos3, turnToward } from "@/lib/playback3d";
import type { Mood } from "@/lib/playback";
import type { LiveRef } from "./live";
import { FxLayer } from "./FxLayer";

const BODY = [
  { rx: 0.5, ry: 0.54, rz: 0.48 }, // yuvarlak
  { rx: 0.43, ry: 0.67, rz: 0.44 }, // uzun
  { rx: 0.6, ry: 0.47, rz: 0.5 }, // geniş
];
const CY = 0.95; // gövde merkezi yüksekliği
const WLEN = [0.95, 0.75, 0.55, 0.8, 1.4, 0.95]; // silah boyu (iz için)
const TRAIL_N = 18;
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const ease = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
const rad = (d: number) => (d * Math.PI) / 180;

const hsl = (h: number, s: number, l: number) => new THREE.Color().setHSL(h / 360, s, l);

/** Silah kolu açıları (derece): 2B sürümdeki aynı duruş, savurma, dönüş ve kaldırma eğrisi. */
function armAngles(swing: number, armUp: number, shield: number) {
  let theta = -18, w = -105;
  if (swing >= 0 && swing <= 1) {
    if (swing < 0.4) {
      const p = ease(swing / 0.4);
      theta = lerp(-18, 160, p); w = lerp(-105, -40, p);
    } else {
      const p = ease((swing - 0.4) / 0.6);
      theta = lerp(160, -80, p); w = lerp(-40, 0, p);
    }
  } else if (swing > 1) {
    const p = ease(Math.min(swing - 1, 1));
    theta = lerp(-80, -18, p); w = lerp(0, -105, p);
  }
  if (armUp > 0) { theta = lerp(theta, -165, armUp); w = lerp(w, -10, armUp); }
  if (shield > 0.05) { theta = lerp(theta, 40, shield); w = lerp(w, -60, shield); }
  return { theta: rad(theta), w: rad(w) };
}

// ---------------------------------------------------------------------------------------------
// Silahlar: elden aşağı (-Y) uzanır
// ---------------------------------------------------------------------------------------------
const steel = { color: "#dfe6ff", metalness: 0.92, roughness: 0.22 } as const;
const wood = { color: "#8a5a2b", metalness: 0, roughness: 0.7 } as const;
const gold = { color: "#ffcf5c", metalness: 0.9, roughness: 0.3 } as const;

function Weapon3D({ kind }: { kind: number }) {
  const axeShape = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0, 0.2);
    s.quadraticCurveTo(0.34, 0.26, 0.34, 0);
    s.quadraticCurveTo(0.34, -0.26, 0, -0.2);
    s.lineTo(0, 0.2);
    return new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2 });
  }, []);
  switch (kind) {
    case 0:
      return (
        <group>
          <mesh castShadow position={[0, -0.1, 0]}><cylinderGeometry args={[0.03, 0.03, 0.2, 10]} /><meshStandardMaterial {...wood} /></mesh>
          <mesh castShadow position={[0, -0.2, 0]}><boxGeometry args={[0.3, 0.05, 0.08]} /><meshStandardMaterial {...gold} /></mesh>
          <mesh castShadow position={[0, -0.65, 0]}><boxGeometry args={[0.09, 0.9, 0.025]} /><meshStandardMaterial {...steel} /></mesh>
          <mesh castShadow position={[0, -1.14, 0]} rotation={[Math.PI, 0, 0]}><coneGeometry args={[0.063, 0.14, 4]} /><meshStandardMaterial {...steel} /></mesh>
        </group>
      );
    case 1:
      return (
        <group>
          <mesh castShadow position={[0, -0.32, 0]}><cylinderGeometry args={[0.035, 0.035, 0.64, 10]} /><meshStandardMaterial {...wood} /></mesh>
          <mesh castShadow position={[0, -0.72, 0]}><sphereGeometry args={[0.17, 16, 12]} /><meshStandardMaterial color="#9aa4c9" metalness={0.85} roughness={0.35} /></mesh>
          {Array.from({ length: 8 }, (_, k) => {
            const a = (k / 8) * Math.PI * 2;
            return (
              <mesh key={k} castShadow position={[Math.cos(a) * 0.19, -0.72, Math.sin(a) * 0.19]} rotation={[Math.sin(a) * 1.5708, 0, -Math.cos(a) * 1.5708]}>
                <coneGeometry args={[0.04, 0.12, 6]} />
                <meshStandardMaterial {...steel} />
              </mesh>
            );
          })}
        </group>
      );
    case 2:
      return (
        <group>
          <mesh castShadow position={[0, -0.07, 0]}><cylinderGeometry args={[0.028, 0.028, 0.14, 10]} /><meshStandardMaterial color="#2a2f55" roughness={0.5} /></mesh>
          <mesh castShadow position={[0, -0.15, 0]}><boxGeometry args={[0.2, 0.04, 0.06]} /><meshStandardMaterial color="#ff5d73" metalness={0.6} roughness={0.35} /></mesh>
          <mesh castShadow position={[0, -0.4, 0]}><boxGeometry args={[0.07, 0.46, 0.02]} /><meshStandardMaterial color="#ffd0d8" metalness={0.9} roughness={0.2} /></mesh>
          <mesh castShadow position={[0, -0.69, 0]} rotation={[Math.PI, 0, 0]}><coneGeometry args={[0.05, 0.12, 4]} /><meshStandardMaterial color="#ffd0d8" metalness={0.9} roughness={0.2} /></mesh>
        </group>
      );
    case 3:
      return (
        <group>
          <mesh castShadow position={[0, -0.42, 0]}><cylinderGeometry args={[0.032, 0.032, 0.84, 10]} /><meshStandardMaterial {...wood} /></mesh>
          <mesh castShadow geometry={axeShape} position={[0.02, -0.7, -0.025]} rotation={[0, 0, 0]}><meshStandardMaterial {...steel} /></mesh>
        </group>
      );
    case 4:
      return (
        <group>
          <mesh castShadow position={[0, -0.5, 0]}><cylinderGeometry args={[0.03, 0.03, 1.5, 10]} /><meshStandardMaterial {...wood} /></mesh>
          <mesh castShadow position={[0, -1.32, 0]} rotation={[Math.PI, 0, 0]}><coneGeometry args={[0.075, 0.3, 4]} /><meshStandardMaterial {...steel} /></mesh>
          <mesh castShadow position={[0, -1.18, 0]}><torusGeometry args={[0.05, 0.015, 8, 12]} /><meshStandardMaterial {...gold} /></mesh>
        </group>
      );
    default:
      return (
        <group>
          <mesh castShadow position={[0, -0.4, 0]}><cylinderGeometry args={[0.035, 0.035, 0.8, 10]} /><meshStandardMaterial {...wood} /></mesh>
          <mesh castShadow position={[0, -0.84, 0]}><boxGeometry args={[0.5, 0.28, 0.28]} /><meshStandardMaterial color="#9aa4c9" metalness={0.85} roughness={0.35} /></mesh>
          <mesh castShadow position={[0, -0.84, 0]}><boxGeometry args={[0.52, 0.06, 0.3]} /><meshStandardMaterial {...gold} /></mesh>
        </group>
      );
  }
}

// ---------------------------------------------------------------------------------------------
// Aksesuarlar
// ---------------------------------------------------------------------------------------------
function Accessory({ kind, top, rx, color, hue }: { kind: number; top: number; rx: number; color: THREE.Color; hue: number }) {
  const accent = useMemo(() => hsl((hue * 0 + 150 + hue) % 360, 0.7, 0.62), [hue]);
  switch (kind) {
    case 0:
      return (
        <group>
          {[-1, 1].map((s) => (
            <mesh key={s} castShadow position={[s * rx * 0.55, top - 0.02, 0]} rotation={[0, 0, -s * 0.5]}>
              <coneGeometry args={[0.085, 0.38, 12]} />
              <meshStandardMaterial color="#f2e6c9" roughness={0.45} />
            </mesh>
          ))}
        </group>
      );
    case 1:
      return (
        <group>
          {[-1, 1].map((s) => (
            <group key={s} position={[s * rx * 0.62, top - 0.08, -0.02]}>
              <mesh castShadow><sphereGeometry args={[0.16, 16, 12]} /><meshPhysicalMaterial color={color} roughness={0.4} clearcoat={0.5} /></mesh>
              <mesh position={[0, 0, 0.1]}><sphereGeometry args={[0.09, 12, 10]} /><meshStandardMaterial color="#ffb3c8" roughness={0.6} /></mesh>
            </group>
          ))}
        </group>
      );
    case 2:
      return (
        <group>
          {[-2, -1, 0, 1, 2].map((k) => (
            <mesh key={k} castShadow position={[0, top + 0.1 - Math.abs(k) * 0.03, k * 0.1]} rotation={[k * 0.22, 0, 0]}>
              <coneGeometry args={[0.07, 0.3 - Math.abs(k) * 0.05, 8]} />
              <meshStandardMaterial color={accent} roughness={0.5} />
            </mesh>
          ))}
        </group>
      );
    case 3:
      return (
        <group position={[0, top + 0.02, 0]}>
          <mesh castShadow><cylinderGeometry args={[0.27, 0.3, 0.13, 20, 1, true]} /><meshStandardMaterial {...gold} side={THREE.DoubleSide} /></mesh>
          {Array.from({ length: 5 }, (_, k) => {
            const a = (k / 5) * Math.PI * 2;
            return (
              <mesh key={k} castShadow position={[Math.cos(a) * 0.28, 0.12, Math.sin(a) * 0.28]}>
                <coneGeometry args={[0.07, 0.16, 6]} />
                <meshStandardMaterial {...gold} />
              </mesh>
            );
          })}
        </group>
      );
    case 4:
      return (
        <group position={[-0.05, top, 0]}>
          <mesh castShadow position={[0, 0.2, 0]} rotation={[0, 0, 0.18]}><cylinderGeometry args={[0.014, 0.014, 0.42, 8]} /><meshStandardMaterial color="#2a2f55" /></mesh>
          <mesh castShadow position={[-0.04, 0.45, 0]}><sphereGeometry args={[0.07, 12, 10]} /><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.2} /></mesh>
        </group>
      );
    case 5:
      return (
        <group position={[0, top - 0.3, 0]}>
          <mesh castShadow rotation={[Math.PI / 2 + 0.12, 0, 0]}><torusGeometry args={[rx * 0.92, 0.035, 8, 28]} /><meshStandardMaterial color={accent} roughness={0.55} /></mesh>
          <mesh castShadow position={[-rx * 0.95, 0.02, -0.05]} rotation={[0, 0, 0.5]}><boxGeometry args={[0.2, 0.05, 0.03]} /><meshStandardMaterial color={accent} /></mesh>
        </group>
      );
    case 6:
      return (
        <group position={[0, top - 0.3, 0]}>
          <mesh castShadow><sphereGeometry args={[rx * 1.04, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color="#9aa4c9" metalness={0.85} roughness={0.3} /></mesh>
          <mesh castShadow position={[0, 0.2, 0.05]}><boxGeometry args={[0.06, 0.34, 0.9 * rx]} /><meshStandardMaterial color="#cfd6f3" metalness={0.8} roughness={0.3} /></mesh>
          <mesh castShadow position={[0, 0.52, -0.05]} rotation={[0.7, 0, 0]}><coneGeometry args={[0.07, 0.34, 8]} /><meshStandardMaterial color={accent} roughness={0.5} /></mesh>
        </group>
      );
    default:
      return (
        <group position={[0, top - 0.12, 0]}>
          <mesh castShadow><cylinderGeometry args={[rx * 1.12, rx * 1.12, 0.04, 24]} /><meshStandardMaterial color="#3f2f96" roughness={0.6} /></mesh>
          <mesh castShadow position={[0, 0.3, 0]} rotation={[0, 0, 0.12]}><coneGeometry args={[rx * 0.7, 0.62, 20]} /><meshStandardMaterial color="#5b49c9" roughness={0.55} /></mesh>
          <mesh position={[0, 0.07, 0]}><torusGeometry args={[rx * 0.66, 0.03, 8, 24]} /><meshStandardMaterial {...gold} /></mesh>
        </group>
      );
  }
}

type Props = { index: number; name: string; live: LiveRef };

export function Fighter3D({ index, name, live }: Props) {
  const look = useMemo(() => lookOf(name), [name]);
  const b = BODY[look.body];
  const hue = HUES[index % HUES.length];
  const color = useMemo(() => hsl(hue, 0.55, 0.46), [hue]);
  const light = useMemo(() => hsl(hue, 0.55, 0.68), [hue]);
  const top = CY + b.ry;
  const eyeX = look.eyes === 1 ? 0.23 : 0.19;
  const eyeY = CY + b.ry * 0.22;
  // elipsoit yüzeyinde z konumu
  const surfZ = (x: number, y: number) => b.rz * Math.sqrt(Math.max(0, 1 - (x / b.rx) ** 2 - ((y - CY) / b.ry) ** 2));

  const root = useRef<THREE.Group>(null);
  const bodyG = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const weaponG = useRef<THREE.Group>(null);
  const shieldG = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  const eyeHurt = useRef<THREE.Group>(null);
  const eyeDead = useRef<THREE.Group>(null);
  const moods = useRef<Record<string, THREE.Group | null>>({});
  const brows = useRef<[THREE.Mesh | null, THREE.Mesh | null]>([null, null]);
  const bodyMat = useRef<THREE.MeshPhysicalMaterial>(null);
  const shadow = useRef<THREE.Mesh>(null);
  const crown = useRef<THREE.Mesh>(null);
  const yawRef = useRef(centerYaw(slotPos3(index, 3).x, slotPos3(index, 3).z));
  const lastMood = useRef<string>("");
  // Her parça gölge düşürür ve alır: kılıç gövdeye, kol vücuda gölge atar
  useEffect(() => {
    root.current?.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !(m.material instanceof THREE.MeshBasicMaterial)) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
  }, []);
  const trail = useRef<THREE.Mesh>(null);
  const samples = useRef<{ a: THREE.Vector3; b: THREE.Vector3 }[]>([]);
  const trailAlpha = useRef(0);
  const tmpA = useMemo(() => new THREE.Vector3(), []);
  const tmpB = useMemo(() => new THREE.Vector3(), []);
  const trailGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(TRAIL_N * 2 * 3), 3));
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(TRAIL_N * 2 * 3), 3));
    const idx: number[] = [];
    for (let i = 0; i < TRAIL_N - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    g.setIndex(idx);
    return g;
  }, []);

  // three.js nesneleri (geometri, malzeme, sahne düğümleri) her karede imperatif güncellenir: R3F'in tasarımı
  // eslint-disable-next-line react-hooks/immutability
  useFrame((state, dt) => {
    const L = live.current;
    const n = Math.max(L.n, 1);
    const home = slotPos3(index, n);
    const A = L.frame?.agents[index] ?? null;
    const t = state.clock.elapsedTime;
    const hpNow = A ? A.hp : (L.hp[index] ?? 10);
    const deadStatic = !A && hpNow <= 0.01;
    const won = L.finished && L.winnerSlot === index;

    const px = A ? A.x : home.x, pz = A ? A.z : home.z;
    const targetYaw = A ? A.yaw : centerYaw(home.x, home.z);
    yawRef.current = turnToward(yawRef.current, targetYaw, Math.min(1, dt * (A ? 14 : 5)));
    const r = root.current!;
    r.position.set(px, 0, pz);
    r.rotation.y = yawRef.current;

    const fall = A ? A.fall : deadStatic ? 1 : 0;
    const lean = A?.lean ?? 0;
    const walk = A?.walk ?? 0;
    const swing = A?.swing ?? -1;
    const armUp = A ? A.armUp : won ? 1 : 0;
    const shield = A?.shield ?? 0;
    const mood: Mood = A ? A.mood : deadStatic ? "dead" : won ? "happy" : hpNow <= 3 && L.phase !== 1 ? "idle" : "idle";
    const worried = !A && hpNow > 0 && hpNow <= 3 && L.phase === 2;

    // Gövde: nefes, zıplama, yaslanma, yıkılma
    const g = bodyG.current!;
    const hop = walk > 0 ? Math.abs(Math.sin(walk)) * 0.1 : 0;
    const winHop = won ? Math.abs(Math.sin(t * 4.2)) * 0.16 : 0;
    const breathe = A ? 0 : Math.sin(t * 2 + index) * 0.018;
    g.position.y = hop + winHop;
    // Ezilme ve esneme: koşarken uzar, vurulunca ezilir, vuruş öncesi çömelir
    const stretch = walk > 0 ? 0.06 : 0;
    const crouch = swing >= 0 && swing < 0.4 ? Math.sin((swing / 0.4) * Math.PI * 0.5) * 0.07 : 0;
    const rc = A?.recoil ?? 0;
    g.scale.set(1 - breathe * 0.4 + rc * 0.09 + crouch * 0.4, 1 + breathe - rc * 0.13 - crouch, 1 - breathe * 0.4 + rc * 0.09 + stretch);
    g.rotation.x = -lean * 0.42 - fall * (Math.PI / 2 - 0.08);
    g.position.z = -fall * 0.2;
    if (fall > 0) g.position.y = fall * 0.42;

    // Bacaklar
    const sw = walk > 0 ? Math.sin(walk) * 0.75 : 0;
    legL.current!.rotation.x = sw;
    legR.current!.rotation.x = -sw;

    // Silah kolu
    const { theta, w } = armAngles(swing, armUp, shield);
    armR.current!.rotation.x = theta;
    weaponG.current!.rotation.x = w;
    // Savurma izi: silahın iki noktasından şerit çizilir, eski örnekler sönükleşir
    const wg = weaponG.current!;
    wg.updateWorldMatrix(true, false);
    const swinging = swing > 0.22 && swing < 1.0;
    if (swinging) {
      trailAlpha.current = 1;
      tmpA.set(0, -0.28, 0);
      tmpB.set(0, -0.28 - WLEN[look.weapon], 0);
      wg.localToWorld(tmpA);
      wg.localToWorld(tmpB);
      // geçersiz (NaN) nokta ize girerse ışıma efektinde siyah lekelere dönüşür: yalnızca geçerli noktalar eklenir
      if (Number.isFinite(tmpA.x + tmpA.y + tmpA.z + tmpB.x + tmpB.y + tmpB.z)) samples.current.unshift({ a: tmpA.clone(), b: tmpB.clone() });
      if (samples.current.length > TRAIL_N) samples.current.pop();
    } else {
      trailAlpha.current = Math.max(0, trailAlpha.current - dt * 4.5);
      if (trailAlpha.current === 0) samples.current.length = 0;
    }
    if (trail.current) {
      const pos = trailGeo.attributes.position.array as Float32Array;
      const col = trailGeo.attributes.color.array as Float32Array;
      const sm = samples.current;
      const gold = (A?.intent === "sword" && L.frame?.effects.some((e) => e.type === "slash" && (e as { gold: boolean }).gold)) ?? false;
      for (let i = 0; i < TRAIL_N; i++) {
        const sp = sm[Math.min(i, sm.length - 1)];
        const f = sm.length ? Math.max(0, 1 - i / TRAIL_N) * trailAlpha.current : 0;
        if (sp) {
          pos.set([sp.a.x, sp.a.y, sp.a.z, sp.b.x, sp.b.y, sp.b.z], i * 6);
        }
        const r = gold ? 1 : 0.95, g = gold ? 0.8 : 0.78, b = gold ? 0.35 : 0.7;
        col.set([r * f, g * f, b * f, r * f * 0.2, g * f * 0.2, b * f * 0.2], i * 6);
      }
      // eslint-disable-next-line react-hooks/immutability
      trailGeo.attributes.position.needsUpdate = true;
      trailGeo.attributes.color.needsUpdate = true;
      trail.current.visible = sm.length > 1;
    }
    armL.current!.rotation.x = walk > 0 ? -sw * 0.8 : 0.2 + Math.sin(t * 1.6 + index) * 0.03 + (armUp > 0 ? -armUp * 2.6 : 0);
    // Kalkan sol kolda yükselir
    const sh = shieldG.current!;
    sh.visible = shield > 0.03;
    sh.scale.setScalar(Math.max(shield, 0.001));

    // Yüz
    const mkey = worried ? "worried" : mood;
    if (lastMood.current !== mkey) {
      lastMood.current = mkey;
      for (const k of Object.keys(moods.current)) if (moods.current[k]) moods.current[k]!.visible = k === mkey;
      if (eyes.current) eyes.current.visible = mkey !== "dead" && mkey !== "hurt";
      if (eyeHurt.current) eyeHurt.current.visible = mkey === "hurt";
      if (eyeDead.current) eyeDead.current.visible = mkey === "dead";
      const angle = mkey === "angry" ? 0.5 : mkey === "worried" ? -0.45 : 0;
      brows.current.forEach((m, i) => { if (m) { m.visible = angle !== 0; m.rotation.z = (i === 0 ? -1 : 1) * angle; } });
    }
    // Göz kırpma
    const blink = Math.pow(Math.max(0, Math.sin(t * 1.4 + index * 2.1)), 40);
    if (eyes.current) eyes.current.scale.y = 1 - blink * 0.92;

    // Vuruş parlaması
    if (bodyMat.current) {
      const f = A?.flash ?? 0;
      bodyMat.current.emissive.setRGB(1, 1, 1);
      bodyMat.current.emissiveIntensity = f * 0.9;
    }
    // Gölge yere yatınca küçülür
    if (shadow.current) shadow.current.scale.setScalar(1 - fall * 0.25);
    if (crown.current) crown.current.visible = won;

  });

  const mouthY = eyeY - 0.2;
  const mouthZ = surfZ(0, mouthY) + 0.01;
  const ink = "#0d1330";
  return (
    <>
    <group ref={root}>
      {/* Zemin gölgesi (ışık gölgesine ek yumuşak leke) */}
      <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[0.6, 24]} />
        <meshBasicMaterial color="#000" transparent opacity={0.28} depthWrite={false} />
      </mesh>
      {/* Kazanan halkası */}
      <mesh ref={crown} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} visible={false}>
        <ringGeometry args={[0.82, 0.95, 40]} />
        <meshBasicMaterial color="#ffcf5c" transparent opacity={0.9} />
      </mesh>

      <group ref={bodyG}>
        {/* Bacaklar */}
        <group ref={legL} position={[-0.2, 0.46, 0]}>
          <mesh castShadow position={[0, -0.22, 0]}><capsuleGeometry args={[0.13, 0.2, 10, 20]} /><meshPhysicalMaterial color={color} roughness={0.4} clearcoat={0.5} /></mesh>
          <mesh castShadow position={[0, -0.4, 0.08]} scale={[1, 0.55, 1.4]}><sphereGeometry args={[0.15, 14, 10]} /><meshStandardMaterial color="#2a2f55" roughness={0.6} /></mesh>
        </group>
        <group ref={legR} position={[0.2, 0.46, 0]}>
          <mesh castShadow position={[0, -0.22, 0]}><capsuleGeometry args={[0.13, 0.2, 10, 20]} /><meshPhysicalMaterial color={color} roughness={0.4} clearcoat={0.5} /></mesh>
          <mesh castShadow position={[0, -0.4, 0.08]} scale={[1, 0.55, 1.4]}><sphereGeometry args={[0.15, 14, 10]} /><meshStandardMaterial color="#2a2f55" roughness={0.6} /></mesh>
        </group>

        {/* Gövde */}
        <mesh castShadow receiveShadow position={[0, CY, 0]} scale={[b.rx, b.ry, b.rz]}>
          <sphereGeometry args={[1, 72, 56]} />
          <meshPhysicalMaterial ref={bodyMat} color={color} roughness={0.34} metalness={0.02} clearcoat={0.85} clearcoatRoughness={0.22} sheen={0.4} sheenColor={light} />
        </mesh>
        <mesh position={[0, CY - b.ry * 0.28, b.rz * 0.62]} scale={[b.rx * 0.62, b.ry * 0.5, b.rz * 0.4]}>
          <sphereGeometry args={[1, 24, 18]} />
          <meshStandardMaterial color={light} roughness={0.5} transparent opacity={0.55} />
        </mesh>

        <Accessory kind={look.acc} top={top} rx={b.rx} color={color} hue={hue} />

        {/* Yüz */}
        {/* Göz kırpma bu grubun dikey ölçeğiyle yapılır: grup göz hizasında durur ki gözler yerinde kapansın, aşağı kaymasın */}
        <group ref={eyes} position={[0, eyeY, 0]}>
          {[-1, 1].map((s) => {
            const x = s * eyeX;
            const z = surfZ(x, eyeY) - 0.02;
            return (
              <group key={s} position={[x, 0, z]}>
                <mesh scale={[1, 1.22, 0.55]}><sphereGeometry args={[0.115, 20, 16]} /><meshStandardMaterial color="#ffffff" roughness={0.2} /></mesh>
                <mesh position={[0.012 * s, 0, 0.06]}><sphereGeometry args={[0.062, 16, 12]} /><meshStandardMaterial color={ink} roughness={0.15} metalness={0.1} /></mesh>
                <mesh position={[0.03 * s, 0.025, 0.105]}><sphereGeometry args={[0.018, 8, 6]} /><meshBasicMaterial color="#fff" /></mesh>
              </group>
            );
          })}
        </group>
        {[-1, 1].map((s, i) => (
          <mesh key={s} ref={(m) => { brows.current[i] = m; }} visible={false} position={[s * eyeX, eyeY + 0.16, surfZ(s * eyeX, eyeY + 0.16)]}>
            <boxGeometry args={[0.17, 0.035, 0.03]} />
            <meshStandardMaterial color={ink} />
          </mesh>
        ))}
        {/* Yanaklar */}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * (eyeX + 0.12), eyeY - 0.12, surfZ(s * (eyeX + 0.12), eyeY - 0.12) + 0.003]} scale={[1, 0.62, 0.3]}>
            <sphereGeometry args={[0.07, 12, 10]} />
            <meshBasicMaterial color="#ff7aa8" transparent opacity={0.35} />
          </mesh>
        ))}
        {/* Ağız ifadeleri */}
        <group position={[0, mouthY, mouthZ]}>
          <group ref={(g) => { moods.current.idle = g; }}><mesh><boxGeometry args={[0.16, 0.028, 0.02]} /><meshStandardMaterial color={ink} /></mesh></group>
          <group ref={(g) => { moods.current.angry = g; }} visible={false}>
            <mesh position={[0, 0.02, 0]} rotation={[0, 0, Math.PI]}><torusGeometry args={[0.09, 0.016, 8, 16, Math.PI]} /><meshStandardMaterial color={ink} /></mesh>
          </group>
          <group ref={(g) => { moods.current.happy = g; }} visible={false}>
            <mesh position={[0, 0.03, 0]}><torusGeometry args={[0.1, 0.018, 8, 18, Math.PI]} /><meshStandardMaterial color={ink} /></mesh>
            <mesh position={[0, 0.0, -0.005]} rotation={[0, 0, Math.PI]}><circleGeometry args={[0.1, 18, 0, Math.PI]} /><meshStandardMaterial color="#7a1f3a" side={THREE.DoubleSide} /></mesh>
          </group>
          <group ref={(g) => { moods.current.hurt = g; }} visible={false}>
            <mesh><sphereGeometry args={[0.05, 12, 10]} /><meshStandardMaterial color={ink} /></mesh>
          </group>
          <group ref={(g) => { moods.current.worried = g; }} visible={false}>
            <mesh position={[0, -0.03, 0]} rotation={[0, 0, Math.PI]}><torusGeometry args={[0.07, 0.015, 8, 14, Math.PI]} /><meshStandardMaterial color={ink} /></mesh>
          </group>
          <group ref={(g) => { moods.current.dead = g; }} visible={false}><mesh><boxGeometry args={[0.14, 0.026, 0.02]} /><meshStandardMaterial color={ink} /></mesh></group>
        </group>
        {/* Acı (> <) ve ölüm (X) gözleri */}
        <group ref={eyeHurt} visible={false}>
          {[-1, 1].map((s2) => (
            <group key={s2} position={[s2 * eyeX, eyeY, surfZ(s2 * eyeX, eyeY) + 0.005]}>
              <mesh rotation={[0, 0, s2 * 0.7]} position={[0, 0.03, 0]}><boxGeometry args={[0.14, 0.028, 0.02]} /><meshStandardMaterial color={ink} /></mesh>
              <mesh rotation={[0, 0, -s2 * 0.7]} position={[0, -0.03, 0]}><boxGeometry args={[0.14, 0.028, 0.02]} /><meshStandardMaterial color={ink} /></mesh>
            </group>
          ))}
        </group>
        <group ref={eyeDead} visible={false}>
          {[-1, 1].map((s2) => (
            <group key={s2} position={[s2 * eyeX, eyeY, surfZ(s2 * eyeX, eyeY) + 0.005]}>
              <mesh rotation={[0, 0, 0.78]}><boxGeometry args={[0.17, 0.03, 0.02]} /><meshStandardMaterial color={ink} /></mesh>
              <mesh rotation={[0, 0, -0.78]}><boxGeometry args={[0.17, 0.03, 0.02]} /><meshStandardMaterial color={ink} /></mesh>
            </group>
          ))}
        </group>

        {/* Sol kol + kalkan */}
        <group ref={armL} position={[-b.rx * 0.95, CY + 0.04, 0.02]}>
          <mesh castShadow position={[0, -0.2, 0]}><capsuleGeometry args={[0.085, 0.2, 10, 16]} /><meshPhysicalMaterial color={color} roughness={0.4} clearcoat={0.5} /></mesh>
          <mesh castShadow position={[0, -0.42, 0]}><sphereGeometry args={[0.105, 14, 12]} /><meshStandardMaterial color={light} roughness={0.5} /></mesh>
        </group>
        <group ref={shieldG} position={[-b.rx * 0.55, CY + 0.02, b.rz * 0.95]} visible={false}>
          <mesh castShadow rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.5, 0.5, 0.07, 28]} /><meshPhysicalMaterial color="#5b9bff" metalness={0.5} roughness={0.28} clearcoat={0.7} emissive="#2d5fc0" emissiveIntensity={0.35} /></mesh>
          <mesh position={[0, 0, 0.05]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.36, 0.03, 8, 28]} /><meshStandardMaterial color="#bcd6ff" metalness={0.8} roughness={0.25} /></mesh>
          <mesh position={[0, 0, 0.09]}><sphereGeometry args={[0.1, 14, 10]} /><meshStandardMaterial {...gold} /></mesh>
        </group>

        {/* Silah kolu */}
        <group ref={armR} position={[b.rx * 0.95, CY + 0.04, 0.02]}>
          <mesh castShadow position={[0, -0.2, 0]}><capsuleGeometry args={[0.085, 0.2, 10, 16]} /><meshPhysicalMaterial color={color} roughness={0.4} clearcoat={0.5} /></mesh>
          <mesh castShadow position={[0, -0.42, 0]}><sphereGeometry args={[0.105, 14, 12]} /><meshStandardMaterial color={light} roughness={0.5} /></mesh>
          <group ref={weaponG} position={[0, -0.42, 0]}>
            <Weapon3D kind={look.weapon} />
          </group>
        </group>
      </group>

    </group>
<FxLayer>
          <mesh ref={trail} geometry={trailGeo} frustumCulled={false} visible={false}>
      <meshBasicMaterial vertexColors transparent depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} toneMapped={false} />
    </mesh>
      </FxLayer>
    </>
  );
}