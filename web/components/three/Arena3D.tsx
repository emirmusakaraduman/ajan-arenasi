"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import * as THREE from "three";
import type { Theme } from "@/lib/themes";
import type { LiveRef } from "./live";
import { Crowd, STAND_H, STAND_R0 } from "./Crowd";
import { FxLayer } from "./FxLayer";

const FLOOR_R = 6;

/** Zemin dokusu: renk geçişi, halkalar, mühür ve (lavda) çatlaklar. Parlayan çizgiler ayrı bir doku olarak bloom'a girer. */
function floorTextures(theme: Theme) {
  const S = 1024;
  const mk = () => {
    const c = document.createElement("canvas");
    c.width = c.height = S;
    return c;
  };
  const map = mk();
  const emi = mk();
  const g = map.getContext("2d")!;
  const e = emi.getContext("2d")!;
  const grad = g.createRadialGradient(S / 2, S / 2, 40, S / 2, S / 2, S / 2);
  grad.addColorStop(0, theme.floor[0]);
  grad.addColorStop(0.65, theme.floor[1]);
  grad.addColorStop(1, theme.floor[2]);
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  // hafif taş/tahta dokusu
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(${i % 2 ? "255,255,255" : "0,0,0"},${0.015 + (i % 5) * 0.004})`;
    const x = Math.random() * S, y = Math.random() * S, r = 4 + Math.random() * 26;
    g.beginPath();
    g.ellipse(x, y, r, r * 0.6, Math.random() * 3, 0, Math.PI * 2);
    g.fill();
  }
  e.fillStyle = "#000";
  e.fillRect(0, 0, S, S);
  const line = (ctx: CanvasRenderingContext2D, color: string, w: number) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.lineCap = "round";
  };
  // halkalar
  for (const [r, w, a] of [[0.97, 8, 1], [0.78, 4, 0.7], [0.36, 3, 0.7]] as const) {
    line(e, theme.rim, w);
    e.globalAlpha = a;
    e.beginPath();
    e.arc(S / 2, S / 2, (S / 2) * r, 0, Math.PI * 2);
    e.stroke();
  }
  // işaret çizgileri
  e.globalAlpha = 0.6;
  line(e, theme.ring, 3);
  for (let k = 0; k < 36; k++) {
    const a = (k / 36) * Math.PI * 2;
    e.beginPath();
    e.moveTo(S / 2 + Math.cos(a) * (S / 2) * 0.93, S / 2 + Math.sin(a) * (S / 2) * 0.93);
    e.lineTo(S / 2 + Math.cos(a) * (S / 2) * 0.88, S / 2 + Math.sin(a) * (S / 2) * 0.88);
    e.stroke();
  }
  if (theme.cracks) {
    e.globalAlpha = 1;
    line(e, theme.cracks, 7);
    for (let k = 0; k < 11; k++) {
      let a = Math.random() * Math.PI * 2, r = 0.18 + Math.random() * 0.2;
      e.beginPath();
      e.moveTo(S / 2 + Math.cos(a) * (S / 2) * r, S / 2 + Math.sin(a) * (S / 2) * r);
      for (let s = 0; s < 6; s++) {
        a += (Math.random() - 0.5) * 0.9;
        r += 0.06 + Math.random() * 0.06;
        e.lineTo(S / 2 + Math.cos(a) * (S / 2) * r, S / 2 + Math.sin(a) * (S / 2) * r);
      }
      e.stroke();
    }
    g.globalAlpha = 0.55;
    g.drawImage(emi, 0, 0);
    g.globalAlpha = 1;
  }
  // Taş karo deseni: halka ve dilimlere bölünmüş zemin, derz çizgileri koyu
  const bump = mk();
  const bc = bump.getContext("2d")!;
  bc.fillStyle = "#9a9a9a";
  bc.fillRect(0, 0, S, S);
  const RINGS = 7;
  for (let ring = 0; ring < RINGS; ring++) {
    const r0 = ((ring + 0.0) / RINGS) * (S / 2), r1 = ((ring + 1.0) / RINGS) * (S / 2);
    const segs = 8 + ring * 6;
    for (let k = 0; k < segs; k++) {
      const a0 = (k / segs) * Math.PI * 2 + ring * 0.2, a1 = ((k + 1) / segs) * Math.PI * 2 + ring * 0.2;
      const shade = 120 + ((ring * 31 + k * 17) % 60);
      bc.fillStyle = `rgb(${shade},${shade},${shade})`;
      bc.beginPath();
      bc.arc(S / 2, S / 2, r1 - 2, a0 + 0.004, a1 - 0.004);
      bc.arc(S / 2, S / 2, r0 + 2, a1 - 0.004, a0 + 0.004, true);
      bc.closePath();
      bc.fill();
      g.fillStyle = `rgba(${(ring + k) % 2 ? "255,255,255" : "0,0,0"},0.05)`;
      g.beginPath();
      g.arc(S / 2, S / 2, r1 - 2, a0 + 0.004, a1 - 0.004);
      g.arc(S / 2, S / 2, r0 + 2, a1 - 0.004, a0 + 0.004, true);
      g.closePath();
      g.fill();
    }
  }
  const bumpTex = new THREE.CanvasTexture(bump);
  bumpTex.anisotropy = 8;
  const tex = new THREE.CanvasTexture(map);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const emissive = new THREE.CanvasTexture(emi);
  emissive.colorSpace = THREE.SRGBColorSpace;
  return { tex, emissive, bumpTex };
}

function Torches({ theme }: { theme: Theme }) {
  const flames = useRef<(THREE.Group | null)[]>([]);
  const lights = useRef<(THREE.PointLight | null)[]>([]);
  const COUNT = 6;
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    for (let k = 0; k < COUNT; k++) {
      const f = 0.85 + Math.sin(t * 11 + k * 3) * 0.1 + Math.sin(t * 23 + k) * 0.05;
      const fl = flames.current[k];
      if (fl) fl.scale.set(1 - (f - 0.85) * 0.5, f, 1 - (f - 0.85) * 0.5);
      const li = lights.current[k];
      if (li) li.intensity = 14 * f;
    }
  });
  return (
    <>
      {Array.from({ length: COUNT }, (_, k) => {
        const a = Math.PI + 0.55 + (k / (COUNT - 1)) * (Math.PI - 1.1); // yalnızca arka yarım
        const x = Math.cos(a) * 7.3, z = Math.sin(a) * 7.3;
        return (
          <group key={k} position={[x, 0, z]}>
            <mesh castShadow position={[0, 0.9, 0]}><cylinderGeometry args={[0.07, 0.1, 1.8, 10]} /><meshStandardMaterial color="#7a5a40" roughness={0.8} /></mesh>
            <mesh position={[0, 1.85, 0]}><cylinderGeometry args={[0.24, 0.12, 0.24, 14]} /><meshStandardMaterial color="#6b4a33" metalness={0.4} roughness={0.5} /></mesh>
            <group ref={(g) => { flames.current[k] = g; }} position={[0, 2.0, 0]}>
              <mesh position={[0, 0.3, 0]}><coneGeometry args={[0.15, 0.55, 10]} /><meshBasicMaterial color={theme.flame[0]} transparent opacity={0.92} toneMapped={false} /></mesh>
              <mesh position={[0, 0.22, 0]}><coneGeometry args={[0.08, 0.36, 8]} /><meshBasicMaterial color={theme.flame[1]} toneMapped={false} /></mesh>
            </group>
            <pointLight ref={(l) => { lights.current[k] = l; }} position={[0, 2.5, 0]} color={theme.glow} intensity={14} distance={9} decay={2} />
          </group>
        );
      })}
    </>
  );
}

function Ambient({ theme }: { theme: Theme }) {
  const COUNT = 180;
  const pts = useRef<THREE.Points>(null);
  const data = useMemo(() => {
    const pos = new Float32Array(COUNT * 3);
    const seed = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 9;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = Math.random() * 7;
      pos[i * 3 + 2] = Math.sin(a) * r;
      seed[i * 3] = Math.random();
      seed[i * 3 + 1] = 0.4 + Math.random();
      seed[i * 3 + 2] = Math.random() * 6.28;
    }
    return { pos, seed };
  }, []);
  useFrame((state, dt) => {
    const p = pts.current;
    if (!p) return;
    const t = state.clock.elapsedTime;
    const arr = p.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < COUNT; i++) {
      const sp = data.seed[i * 3 + 1];
      if (theme.particle === "snow") {
        arr[i * 3 + 1] -= dt * 0.7 * sp;
        arr[i * 3] += Math.sin(t + data.seed[i * 3 + 2]) * dt * 0.25;
        if (arr[i * 3 + 1] < 0) arr[i * 3 + 1] = 7;
      } else if (theme.particle === "ember") {
        arr[i * 3 + 1] += dt * 1.1 * sp;
        arr[i * 3] += Math.sin(t * 1.5 + data.seed[i * 3 + 2]) * dt * 0.4;
        if (arr[i * 3 + 1] > 7) arr[i * 3 + 1] = 0;
      } else {
        arr[i * 3 + 1] += Math.sin(t * 0.6 + data.seed[i * 3 + 2]) * dt * 0.12;
        arr[i * 3] += Math.cos(t * 0.4 + data.seed[i * 3 + 2]) * dt * 0.1;
      }
    }
    p.geometry.attributes.position.needsUpdate = true;
  });
  const color = theme.particle === "snow" ? "#ffffff" : theme.particle === "ember" ? theme.flame[0] : theme.beam;
  return (
    <points ref={pts}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[data.pos, 3]} />
      </bufferGeometry>
      <pointsMaterial color={color} size={theme.particle === "dust" ? 0.05 : 0.09} transparent opacity={theme.particle === "dust" ? 0.5 : 0.9} depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
    </points>
  );
}

/** Ay ışığı hüzmeleri: eklemeli karışımlı, yarı saydam koniler */
function Beams({ theme }: { theme: Theme }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    refs.current.forEach((m, k) => {
      if (m) {
        m.rotation.z = Math.sin(t * 0.35 + k * 2) * 0.05 + (k - 1) * 0.12;
        (m.material as THREE.MeshBasicMaterial).opacity = 0.05 + Math.sin(t * 0.8 + k) * 0.012;
      }
    });
  });
  return (
    <>
      {[-4.5, 0, 4.5].map((x, k) => (
        <mesh key={k} ref={(m) => { refs.current[k] = m; }} position={[x, 5, -2 - Math.abs(x) * 0.2]}>
          <coneGeometry args={[3.2, 10, 24, 1, true]} />
          <meshBasicMaterial color={theme.beam} transparent opacity={0.05} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </>
  );
}

/** Arka yarım daire boyunca sütunlar ve rüzgârda sallanan sancaklar */
function Colonnade({ theme }: { theme: Theme }) {
  const banners = useRef<(THREE.Mesh | null)[]>([]);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    banners.current.forEach((m, k) => {
      if (m) {
        m.rotation.x = Math.sin(t * 1.2 + k * 1.7) * 0.05;
        m.rotation.z = Math.sin(t * 0.9 + k) * 0.03;
      }
    });
  });
  const N = 9;
  const stone = theme.key === "ice" ? "#8fb7cf" : theme.key === "desert" ? "#b99466" : theme.key === "lava" ? "#3a2a2e" : "#4a4f86";
  return (
    <>
      {Array.from({ length: N }, (_, k) => {
        const a = Math.PI + 0.3 + (k / (N - 1)) * (Math.PI - 0.6);
        const x = Math.cos(a) * 13.4, z = Math.sin(a) * 13.4;
        const yaw = Math.atan2(-x, -z);
        const bx = Math.cos(a + 0.19) * 13.1, bz = Math.sin(a + 0.19) * 13.1;
        return (
          <group key={k}>
            <group position={[x, 0, z]} rotation={[0, yaw, 0]}>
              <mesh castShadow receiveShadow position={[0, 0.25, 0]}><boxGeometry args={[1.1, 0.5, 1.1]} /><meshStandardMaterial color={stone} roughness={0.8} /></mesh>
              <mesh castShadow receiveShadow position={[0, 3.6, 0]}><cylinderGeometry args={[0.5, 0.6, 6.2, 20]} /><meshStandardMaterial color={stone} roughness={0.65} /></mesh>
              <mesh castShadow position={[0, 6.85, 0]}><boxGeometry args={[1.5, 0.45, 1.5]} /><meshStandardMaterial color={stone} roughness={0.7} /></mesh>
              <mesh position={[0, 7.2, 0]}><boxGeometry args={[1.8, 0.3, 1.8]} /><meshStandardMaterial color={stone} roughness={0.7} /></mesh>
            </group>
            {k < N - 1 && (
              <group position={[bx, 6.2, bz]} rotation={[0, Math.atan2(-bx, -bz), 0]}>
                <mesh ref={(m) => { banners.current[k] = m; }} position={[0, -2.0, 0]} castShadow>
                  <planeGeometry args={[1.9, 4.2, 1, 8]} />
                  <meshStandardMaterial color={theme.rim} emissive={theme.rim} emissiveIntensity={0.25} roughness={0.8} side={THREE.DoubleSide} />
                </mesh>
                <mesh position={[0, -1.3, 0.02]}><circleGeometry args={[0.45, 24]} /><meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.3} /></mesh>
                <mesh position={[0, 0.12, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.05, 0.05, 2.1, 8]} /><meshStandardMaterial color="#222" metalness={0.6} roughness={0.4} /></mesh>
              </group>
            )}
          </group>
        );
      })}
    </>
  );
}

export function Arena3D({ theme, live }: { theme: Theme; live: LiveRef }) {
  const { tex, emissive, bumpTex } = useMemo(() => floorTextures(theme), [theme]);
  const lava = !!theme.cracks;
  const emiMat = useRef<THREE.MeshStandardMaterial>(null);
  useFrame((state) => {
    if (emiMat.current) emiMat.current.emissiveIntensity = (lava ? 1.4 : 0.8) + Math.sin(state.clock.elapsedTime * (lava ? 2 : 1)) * (lava ? 0.35 : 0.12);
  });
  return (
    <>
      <color attach="background" args={[theme.sky[1]]} />
      <fogExp2 attach="fog" args={[theme.sky[1], 0.026]} />

      {/* Işıklandırma */}
      <hemisphereLight args={[theme.sky[0], theme.ground, 0.85]} />
      <directionalLight castShadow position={[5, 10, 6]} intensity={2.6} color="#fff0dc" shadow-mapSize={[4096, 4096]} shadow-radius={4} shadow-bias={-0.0006} shadow-normalBias={0.05}
        shadow-camera-left={-8} shadow-camera-right={8} shadow-camera-top={8} shadow-camera-bottom={-8} shadow-camera-near={1} shadow-camera-far={28} />
      <directionalLight position={[-7, 5, -8]} intensity={1.4} color={theme.beam} />
      <spotLight position={[0, 9, 0]} angle={0.62} penumbra={1} intensity={90} color={theme.beam} distance={20} decay={1.6} target-position={[0, 0, 0]} />

      <Environment resolution={256} environmentIntensity={0.55}>
        <Lightformer form="rect" intensity={2.2} position={[0, 6, -8]} scale={[14, 4, 1]} color={theme.beam} />
        <Lightformer form="rect" intensity={1.4} position={[-8, 3, 2]} rotation-y={Math.PI / 2} scale={[8, 3, 1]} color="#ffffff" />
        <Lightformer form="rect" intensity={1.8} position={[8, 3, 3]} rotation-y={-Math.PI / 2} scale={[8, 2.5, 1]} color={theme.beam} />
        <Lightformer form="rect" intensity={2.6} position={[0, 2, 9]} scale={[12, 1.2, 1]} color="#ffffff" />
        <Lightformer form="ring" intensity={1.6} position={[0, 8, 0]} rotation-x={Math.PI / 2} scale={6} color={theme.glow} />
      </Environment>

      {/* Zemin */}
      <mesh receiveShadow position={[0, -0.28, 0]}>
        <cylinderGeometry args={[FLOOR_R + 0.35, FLOOR_R + 0.55, 0.56, 64]} />
        <meshStandardMaterial color={theme.floor[2]} roughness={0.7} metalness={0.1} />
      </mesh>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <circleGeometry args={[FLOOR_R, 96]} />
        <meshStandardMaterial ref={emiMat} map={tex} bumpMap={bumpTex} bumpScale={theme.key === "ice" ? 0.5 : 1.4} emissiveMap={emissive} emissive="#ffffff" emissiveIntensity={0.8} roughness={theme.key === "ice" ? 0.14 : 0.52} metalness={theme.key === "ice" ? 0.35 : 0.08} envMapIntensity={theme.key === "ice" ? 1.6 : 0.7} />
      </mesh>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[FLOOR_R + 0.08, 0.1, 12, 96]} />
        <meshStandardMaterial color={theme.rim} emissive={theme.rim} emissiveIntensity={1.4} roughness={0.3} />
      </mesh>

      {/* Dış zemin ve duvar */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.55, 0]} receiveShadow>
        <circleGeometry args={[30, 48]} />
        <meshStandardMaterial color={theme.ground} roughness={0.95} />
      </mesh>
      {/* Tribün: basamaklı kademeler */}
      {[0, 1, 2, 3].map((t) => {
        const r0 = STAND_R0(t), r1 = r0 + 1.2, h = STAND_H(t);
        return (
          <group key={t}>
            <mesh position={[0, (h - 0.55) / 2, 0]} receiveShadow>
              <cylinderGeometry args={[r0, r0, h + 0.55, 96, 1, true]} />
              <meshStandardMaterial color={theme.floor[2]} roughness={0.9} side={THREE.DoubleSide} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, h, 0]} receiveShadow>
              <ringGeometry args={[r0, r1, 96]} />
              <meshStandardMaterial color={theme.ground} roughness={0.85} />
            </mesh>
          </group>
        );
      })}
      {/* Arena bariyeri */}
      <mesh position={[0, 0.5, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[7.45, 7.45, 1.1, 96, 1, true]} />
        <meshStandardMaterial color={theme.floor[2]} roughness={0.6} metalness={0.15} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 1.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[7.45, 0.07, 10, 120]} />
        <meshStandardMaterial color={theme.rim} emissive={theme.rim} emissiveIntensity={1.2} roughness={0.3} />
      </mesh>
      <mesh position={[0, 4.2, 0]}>
        <cylinderGeometry args={[14.9, 14.9, 10, 64, 1, true]} />
        <meshStandardMaterial color={theme.sky[1]} roughness={1} side={THREE.BackSide} />
      </mesh>

      <Colonnade theme={theme} />
      <Crowd theme={theme} live={live} />
      <Torches theme={theme} />
      {/* ışık hüzmeleri ve havadaki parçacıklar zemine sahte gölge bırakmasın */}
      <FxLayer>
        <Beams theme={theme} />
        <Ambient theme={theme} />
      </FxLayer>
    </>
  );
}
