"use client";

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Effect3D } from "@/lib/playback3d";
import type { LiveRef } from "./live";

const SLASH = 3, IMPACT = 3, SPARK = 3, RING = 3, DUST = 14, LIGHT = 3;
const IMPACT_N = 44, SPARK_N = 16;

type Of<K extends Effect3D["type"]> = Extract<Effect3D, { type: K }>;
const pick = <K extends Effect3D["type"]>(list: Effect3D[], type: K) => list.filter((e): e is Of<K> => e.type === type);

function rand(seed: number) {
  const x = Math.sin(seed * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

/** Vuruş ve etki efektleri: sabit havuzlar, her karede komut verilir. React yeniden çizdirmez. */
export function Effects3D({ live }: { live: LiveRef }) {
  const slashes = useRef<(THREE.Mesh | null)[]>([]);
  const impacts = useRef<(THREE.Group | null)[]>([]);
  const sparks = useRef<(THREE.Points<THREE.BufferGeometry<THREE.NormalBufferAttributes>> | null)[]>([]);
  const rings = useRef<(THREE.Mesh | null)[]>([]);
  const dust = useRef<(THREE.Mesh | null)[]>([]);
  const lights = useRef<(THREE.PointLight | null)[]>([]);
  const { camera, size } = useThree();
  const v = useMemo(() => new THREE.Vector3(), []);

  // Parçacık yön tohumları (bir kez üretilir)
  const impactSeeds = useMemo(
    () => Array.from({ length: IMPACT }, (_, p) => Array.from({ length: IMPACT_N }, (_, i) => {
      const a = rand(p * 100 + i) * Math.PI * 2, e = (rand(p * 100 + i + 0.5) - 0.2) * 1.6, sp = 1.2 + rand(p * 100 + i + 0.9) * 2.6;
      return [Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp + 0.6, Math.sin(a) * Math.cos(e) * sp];
    })),
    [],
  );
  const impactGeo = useMemo(() => Array.from({ length: IMPACT }, () => new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(IMPACT_N * 3), 3))), []);
  const sparkGeo = useMemo(() => Array.from({ length: SPARK }, () => new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(SPARK_N * 3), 3))), []);

  useFrame(() => {
    const list = live.current.frame?.effects ?? [];
    const sl = pick(list, "slash"), im = pick(list, "impact"), sp = pick(list, "spark"), rg = pick(list, "ring"), du = pick(list, "dust"), li = pick(list, "light"), nu = pick(list, "num");

    slashes.current.forEach((m, i) => {
      if (!m) return;
      const e = sl[i];
      m.visible = !!e && e.p > 0 && e.p < 1;
      if (!e || !m.visible) return;
      m.position.set(e.x, e.y, e.z);
      m.rotation.set(0, e.yaw + Math.PI / 2, -0.9 + e.p * 1.9);
      const s = (e.gold ? 1.5 : 1.05) * (0.8 + 0.5 * e.p);
      m.scale.setScalar(s);
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.color.set(e.gold ? "#ffcf5c" : "#ff6a5c");
      mat.opacity = (1 - e.p) * 0.95;
    });

    impacts.current.forEach((g, i) => {
      if (!g) return;
      const e = im[i];
      g.visible = !!e && e.p > 0 && e.p < 1;
      if (!e || !g.visible) return;
      g.position.set(e.x, e.y, e.z);
      const pts = g.children[0] as THREE.Points;
      const arr = (pts.geometry.attributes.position.array as Float32Array);
      const seeds = impactSeeds[i];
      const k = e.gold ? 1.5 : 1;
      for (let j = 0; j < IMPACT_N; j++) {
        const s = seeds[j];
        arr[j * 3] = s[0] * e.p * k;
        arr[j * 3 + 1] = s[1] * e.p * k - 2.2 * e.p * e.p;
        arr[j * 3 + 2] = s[2] * e.p * k;
      }
      pts.geometry.attributes.position.needsUpdate = true;
      const pm = pts.material as THREE.PointsMaterial;
      pm.color.set(e.gold ? "#ffd66b" : "#ffb25e");
      pm.opacity = 1 - e.p * e.p;
      const core = g.children[1] as THREE.Mesh;
      core.scale.setScalar((e.gold ? 0.55 : 0.3) * (0.2 + 1.5 * Math.min(1, e.p * 3)));
      (core.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.8 - e.p * 3.0);
      (core.material as THREE.MeshBasicMaterial).color.set(e.gold ? "#fff3c4" : "#ffe1b8");
    });

    sparks.current.forEach((pt, i) => {
      if (!pt) return;
      const e = sp[i];
      pt.visible = !!e && e.p > 0 && e.p < 1;
      if (!e || !pt.visible) return;
      pt.position.set(e.x, e.y, e.z);
      const arr = pt.geometry.attributes.position.array as Float32Array;
      for (let j = 0; j < SPARK_N; j++) {
        const a = rand(i * 50 + j) * Math.PI * 2, sv = 0.6 + rand(i * 50 + j + 0.3) * 1.5;
        arr[j * 3] = Math.cos(a) * sv * e.p;
        arr[j * 3 + 1] = Math.sin(a) * sv * e.p * 0.8 + 0.2 * e.p;
        arr[j * 3 + 2] = (rand(i * 50 + j + 0.6) - 0.5) * sv * e.p;
      }
      pt.geometry.attributes.position.needsUpdate = true;
      (pt.material as THREE.PointsMaterial).opacity = 1 - e.p;
    });

    rings.current.forEach((m, i) => {
      if (!m) return;
      const e = rg[i];
      m.visible = !!e && e.p > 0 && e.p < 1;
      if (!e || !m.visible) return;
      m.position.set(e.x, e.y + 0.02, e.z);
      m.scale.setScalar(0.4 + e.p * 3.4);
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.color.set(e.color);
      mat.opacity = (1 - e.p) * 0.9;
    });

    dust.current.forEach((m, i) => {
      if (!m) return;
      const e = du[i];
      m.visible = !!e;
      if (!e) return;
      const dx = (e.k % 2 ? 1 : -1) * e.p * 0.4;
      m.position.set(e.x + dx, 0.12 + e.p * 0.3, e.z);
      m.scale.set(0.18 + e.p * 0.55, 0.12 + e.p * 0.3, 0.18 + e.p * 0.55);
      (m.material as THREE.MeshBasicMaterial).opacity = 0.4 * (1 - e.p);
    });

    lights.current.forEach((l, i) => {
      if (!l) return;
      const e = li[i];
      if (!e) { l.intensity = 0; return; }
      l.position.set(e.x, e.y, e.z);
      l.color.set(e.color);
      l.intensity = 60 * Math.pow(Math.max(0, 1 - e.p), 2);
    });

    // Uçan sayılar: ekran katmanındaki öğeleri projeksiyonla konumla
    live.current.nums.forEach((el, i) => {
      if (!el) return;
      const e = nu[i];
      if (!e) { el.style.opacity = "0"; return; }
      v.set(e.x, e.y, e.z).project(camera);
      el.textContent = e.text;
      el.style.color = e.color;
      el.style.opacity = String(1 - e.p * e.p);
      el.style.transform = `translate(${(v.x * 0.5 + 0.5) * size.width}px, ${(-v.y * 0.5 + 0.5) * size.height}px) translate(-50%, -50%) scale(${0.7 + 0.5 * Math.min(1, e.p * 4)})`;
    });
  });

  return (
    <>
      {Array.from({ length: SLASH }, (_, i) => (
        <mesh key={`s${i}`} ref={(m) => { slashes.current[i] = m; }} visible={false}>
          <ringGeometry args={[0.55, 1.0, 40, 1, 0, Math.PI * 0.95]} />
          <meshBasicMaterial transparent depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} color="#ff6a5c" />
        </mesh>
      ))}
      {Array.from({ length: IMPACT }, (_, i) => (
        <group key={`i${i}`} ref={(g) => { impacts.current[i] = g; }} visible={false}>
          <points geometry={impactGeo[i]}>
            <pointsMaterial size={0.13} transparent depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation color="#ffb25e" />
          </points>
          <mesh>
            <sphereGeometry args={[1, 18, 14]} />
            <meshBasicMaterial transparent depthWrite={false} blending={THREE.AdditiveBlending} color="#ffe1b8" />
          </mesh>
        </group>
      ))}
      {Array.from({ length: SPARK }, (_, i) => (
        <points key={`k${i}`} ref={(p) => { sparks.current[i] = p as never; }} geometry={sparkGeo[i]} visible={false}>
          <pointsMaterial size={0.1} transparent depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation color="#bcd6ff" />
        </points>
      ))}
      {Array.from({ length: RING }, (_, i) => (
        <mesh key={`r${i}`} ref={(m) => { rings.current[i] = m; }} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
          <ringGeometry args={[0.86, 1.0, 64]} />
          <meshBasicMaterial transparent depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {Array.from({ length: DUST }, (_, i) => (
        <mesh key={`d${i}`} ref={(m) => { dust.current[i] = m; }} visible={false}>
          <sphereGeometry args={[1, 12, 8]} />
          <meshBasicMaterial transparent depthWrite={false} color="#c9cffa" />
        </mesh>
      ))}
      {Array.from({ length: LIGHT }, (_, i) => (
        <pointLight key={`l${i}`} ref={(l) => { lights.current[i] = l; }} intensity={0} distance={7} decay={2} />
      ))}
    </>
  );
}
