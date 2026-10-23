"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Theme } from "@/lib/themes";
import type { LiveRef } from "./live";

const SKIN = ["#f1c9a5", "#e0ac84", "#c68642", "#8d5524", "#ffdbb4", "#a1665e"];
const HAIR = ["#1c1410", "#3b2a1e", "#6b4423", "#b5651d", "#d9b36a", "#8a8a8a", "#2a2f55", "#c0392b"];
export const STAND_H = (t: number) => 0.35 + t * 0.7; // kademe yüksekliği
export const STAND_R0 = (t: number) => 7.7 + t * 1.2; // kademe iç yarıçapı

// Koltuklar: her kademede eşit aralıklı, kişi başına ~0,8 m; komşu kademeler yarım koltuk kaydırılır.
// Böylece kimse birbirinin içine girmez (eskiden rastgele dağılım üst üste binmeye ve kararmaya yol açıyordu).
const SEAT_W = 0.82;
const SEATS = Array.from({ length: 4 }, (_, tier) => {
  const r = 7.7 + tier * 1.2 + 0.6;
  const n = Math.floor((Math.PI * 2 * r) / SEAT_W);
  return Array.from({ length: n }, (_, i) => ({ tier, r, a: ((i + (tier % 2) * 0.5) / n) * Math.PI * 2 }));
}).flat();

const rnd = (i: number, salt: number) => {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * Seyirciler: her biri yüzlü (göz, tezahürat yaparken açılan ağız), canlı renkli kıyafetli ve kendi tarzında hareket eder:
 * el sallayan, alkışlayan, yumruk kaldıran, iki yana sallanan. Bazıları atkı, bayrak ya da pankart taşır.
 * Arenada vuruş olunca zıplayıp coşar, maç bitince tribün ayağa kalkar, dalga stadyumu dolaşır.
 */
export function Crowd({ theme, live }: { theme: Theme; live: LiveRef }) {
  const COUNT = SEATS.length;
  const FLAGS = 30;
  const SIGNS = 24;
  const torso = useRef<THREE.InstancedMesh>(null);
  const head = useRef<THREE.InstancedMesh>(null);
  const hair = useRef<THREE.InstancedMesh>(null);
  const armL = useRef<THREE.InstancedMesh>(null);
  const armR = useRef<THREE.InstancedMesh>(null);
  const handL = useRef<THREE.InstancedMesh>(null);
  const handR = useRef<THREE.InstancedMesh>(null);
  const eyes = useRef<THREE.InstancedMesh>(null);
  const mouth = useRef<THREE.InstancedMesh>(null);
  const scarf = useRef<THREE.InstancedMesh>(null);
  const pole = useRef<THREE.InstancedMesh>(null);
  const cloth = useRef<THREE.InstancedMesh>(null);
  const sign = useRef<THREE.InstancedMesh>(null);

  const people = useMemo(
    () =>
      Array.from({ length: COUNT }, (_, k) => {
        const { tier, r: r0, a: a0 } = SEATS[k];
        const a = a0 + (rnd(k, 1) - 0.5) * 0.012; // en fazla birkaç santim oynar, komşuya değmez
        const r = r0 + (rnd(k, 16) - 0.5) * 0.12;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        const [h0, h1] = theme.crowd;
        // çoğu tema tonunda, bir kısmı tamamen rastgele renkte: tribün cıvıl cıvıl görünsün
        const hue = rnd(k, 9) < 0.7 ? h0 + rnd(k, 12) * Math.max(h1 - h0, 1) : rnd(k, 13) * 360;
        const signIdx = k % 15 === 7 ? Math.floor(k / 15) : -1;
        return {
          x, z, y: STAND_H(tier), a,
          yaw: Math.atan2(-x, -z) + (rnd(k, 2) - 0.5) * 0.4,
          ph: rnd(k, 3) * 6.28,
          s: 0.9 + rnd(k, 4) * 0.14,
          // tarz: 0 el sallar, 1 alkışlar, 2 yumruk kaldırır, 3 iki yana sallanır, 4 pankart tutar
          style: signIdx >= 0 ? 4 : Math.floor(rnd(k, 5) * 4),
          energy: 0.55 + rnd(k, 14) * 0.6,
          skin: SKIN[Math.floor(rnd(k, 6) * SKIN.length)],
          hair: HAIR[Math.floor(rnd(k, 7) * HAIR.length)],
          cap: rnd(k, 8) < 0.22,
          hue, sat: 0.6 + rnd(k, 10) * 0.3, lit: 0.46 + rnd(k, 11) * 0.16,
          scarf: rnd(k, 15) < 0.35,
          flag: k % 12 === 0 ? Math.floor(k / 12) : -1,
          sign: signIdx,
        };
      }),
    [theme, COUNT],
  );

  useEffect(() => {
    // Sahibi olmayan bayrak ve pankart kopyaları görünmez kalır (yoksa arenanın ortasında belirirler)
    const none = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let j = 0; j < FLAGS; j++) { pole.current?.setMatrixAt(j, none); cloth.current?.setMatrixAt(j, none); }
    for (let j = 0; j < SIGNS; j++) sign.current?.setMatrixAt(j, none);
    const c = new THREE.Color();
    const teamCols = [theme.rim, theme.ring, "#ffcf5c", "#ff5d73", "#4be3b0", "#ffffff"];
    people.forEach((p, k) => {
      c.setHSL((p.hue % 360) / 360, p.sat, p.lit);
      torso.current?.setColorAt(k, c);
      c.set(p.skin);
      for (const m of [head, armL, armR, handL, handR]) m.current?.setColorAt(k, c);
      c.set(p.cap ? `hsl(${Math.floor(p.hue + 150) % 360}, 70%, 50%)` : p.hair);
      hair.current?.setColorAt(k, c);
      c.set(teamCols[k % teamCols.length]);
      scarf.current?.setColorAt(k, c);
    });
    for (let j = 0; j < FLAGS; j++) {
      c.set(teamCols[j % teamCols.length]);
      cloth.current?.setColorAt(j, c);
    }
    for (let j = 0; j < SIGNS; j++) {
      c.set(teamCols[(j + 2) % teamCols.length]);
      sign.current?.setColorAt(j, c);
    }
    for (const m of [torso, head, hair, armL, armR, handL, handR, scarf, cloth, sign]) if (m.current?.instanceColor) m.current.instanceColor.needsUpdate = true;
  }, [people, theme]);

  // Her karede yeniden kullanılan iskelet: dönüşler kişi kişi uygulanıp parçaların dünya matrisleri okunur
  const rig = useMemo(() => {
    const o = {
      base: new THREE.Object3D(), body: new THREE.Object3D(),
      torso: new THREE.Object3D(), head: new THREE.Object3D(), hair: new THREE.Object3D(),
      eyeL: new THREE.Object3D(), eyeR: new THREE.Object3D(), mouth: new THREE.Object3D(), scarf: new THREE.Object3D(),
      shL: new THREE.Object3D(), shR: new THREE.Object3D(), armL: new THREE.Object3D(), armR: new THREE.Object3D(),
      handL: new THREE.Object3D(), handR: new THREE.Object3D(),
      pole: new THREE.Object3D(), cloth: new THREE.Object3D(), sign: new THREE.Object3D(),
    };
    o.base.add(o.body);
    o.body.add(o.torso, o.head, o.scarf, o.shL, o.shR, o.pole, o.cloth, o.sign);
    o.head.add(o.hair, o.eyeL, o.eyeR, o.mouth);
    o.shL.add(o.armL);
    o.shR.add(o.armR);
    o.armL.add(o.handL);
    o.armR.add(o.handR);
    o.torso.position.set(0, 0.44, 0);
    o.scarf.position.set(0, 0.74, 0);
    o.scarf.rotation.set(Math.PI / 2, 0, 0);
    o.head.position.set(0, 0.98, 0);
    o.hair.position.set(0, 0.03, -0.01);
    o.eyeL.position.set(-0.065, 0.02, 0.17);
    o.eyeR.position.set(0.065, 0.02, 0.17);
    o.mouth.position.set(0, -0.07, 0.172);
    o.shL.position.set(-0.24, 0.68, 0);
    o.shR.position.set(0.24, 0.68, 0);
    o.armL.position.set(0, -0.15, 0);
    o.armR.position.set(0, -0.15, 0);
    o.handL.position.set(0, -0.17, 0);
    o.handR.position.set(0, -0.17, 0);
    return o;
  }, []);

  const hidden = useMemo(() => new THREE.Matrix4().makeScale(0, 0, 0), []);
  const pulse = useRef(0);
  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const L = live.current;
    // vuruş anında coşku birden yükselir, sonra yavaşça söner
    pulse.current = Math.max((L.frame?.hitPulse ?? 0) * 3.2, pulse.current - dt * 0.9);
    const excite = 0.25 + (L.frame ? 0.25 : 0) + pulse.current + (L.finished ? 1.2 : 0);
    const { base, body } = rig;
    people.forEach((p, k) => {
      const wave = Math.max(0, Math.sin(p.a * 3 - t * 1.6)); // stadyumu dolaşan dalga
      const e = Math.min(1.6, excite * p.energy + wave * 0.6);
      const jump = Math.max(0, Math.sin(t * (3 + e * 1.5) + p.ph)) * 0.13 * Math.max(0, e - 0.35);
      const sway = Math.sin(t * 1.6 + p.ph) * (p.style === 3 ? 0.14 : 0.04) * (0.6 + e * 0.5);
      base.position.set(p.x, p.y + jump, p.z);
      base.rotation.set(0, p.yaw, 0);
      base.scale.setScalar(p.s);
      body.rotation.set(-Math.min(0.25, pulse.current * 0.12), 0, sway);
      rig.head.rotation.set(Math.sin(t * 2.2 + p.ph) * 0.06, Math.sin(t * 0.7 + p.ph) * 0.25, -sway * 0.6);

      // kollar: kişinin tarzına göre
      const up = Math.min(1, 0.15 + e * 0.6 + wave * 0.5);
      if (p.style === 0) {
        rig.shL.rotation.set(0, 0, -(0.2 + up * 2.6) + Math.sin(t * 7 + p.ph) * 0.25 * up);
        rig.shR.rotation.set(0, 0, 0.2 + up * 2.6 + Math.sin(t * 7 + p.ph + 1) * 0.25 * up);
      } else if (p.style === 1) {
        const clap = (Math.sin(t * (9 + e * 4) + p.ph) + 1) / 2;
        const lift = -1.1 - up * 0.9;
        rig.shL.rotation.set(lift, 0, -0.05 - clap * 0.35);
        rig.shR.rotation.set(lift, 0, 0.05 + clap * 0.35);
      } else if (p.style === 2) {
        const pump = (Math.sin(t * (5 + e * 3) + p.ph) + 1) / 2;
        rig.shL.rotation.set(0, 0, -0.25);
        rig.shR.rotation.set(0, 0, 1.6 + pump * 1.4 * up);
      } else if (p.style === 3) {
        rig.shL.rotation.set(0, 0, -0.3 - up * 0.45);
        rig.shR.rotation.set(0, 0, 0.3 + up * 0.45);
      } else {
        rig.shL.rotation.set(0, 0, -2.75);
        rig.shR.rotation.set(0, 0, 2.75);
      }

      // ağız: coştukça açılır
      rig.mouth.scale.set(1, 0.35 + Math.min(1, e) * 1.1, 1);

      if (p.flag >= 0) {
        rig.pole.position.set(0.3, 1.45, 0);
        rig.pole.rotation.set(0, 0, Math.sin(t * 2 + p.ph) * 0.15);
        rig.cloth.position.set(0.55, 2.05, 0);
        rig.cloth.rotation.set(0, Math.sin(t * 3.4 + p.ph) * 0.45, Math.sin(t * 2.4 + p.ph) * 0.1);
      }
      if (p.sign >= 0) {
        rig.sign.position.set(0, 1.62 + Math.sin(t * 4 + p.ph) * 0.05 * e, 0.05);
        rig.sign.rotation.set(-0.1, 0, Math.sin(t * 2.6 + p.ph) * 0.12);
      }

      base.updateMatrixWorld(true);
      torso.current?.setMatrixAt(k, rig.torso.matrixWorld);
      head.current?.setMatrixAt(k, rig.head.matrixWorld);
      hair.current?.setMatrixAt(k, rig.hair.matrixWorld);
      armL.current?.setMatrixAt(k, rig.armL.matrixWorld);
      armR.current?.setMatrixAt(k, rig.armR.matrixWorld);
      handL.current?.setMatrixAt(k, rig.handL.matrixWorld);
      handR.current?.setMatrixAt(k, rig.handR.matrixWorld);
      eyes.current?.setMatrixAt(k * 2, rig.eyeL.matrixWorld);
      eyes.current?.setMatrixAt(k * 2 + 1, rig.eyeR.matrixWorld);
      mouth.current?.setMatrixAt(k, rig.mouth.matrixWorld);
      scarf.current?.setMatrixAt(k, p.scarf ? rig.scarf.matrixWorld : hidden);
      if (p.flag >= 0 && p.flag < FLAGS) {
        pole.current?.setMatrixAt(p.flag, rig.pole.matrixWorld);
        cloth.current?.setMatrixAt(p.flag, rig.cloth.matrixWorld);
      }
      if (p.sign >= 0 && p.sign < SIGNS) sign.current?.setMatrixAt(p.sign, rig.sign.matrixWorld);
    });
    for (const m of [torso, head, hair, armL, armR, handL, handR, eyes, mouth, scarf, pole, cloth, sign]) if (m.current) m.current.instanceMatrix.needsUpdate = true;
  });

  const shared = { frustumCulled: false } as const;
  return (
    <>
      <instancedMesh ref={torso} args={[undefined, undefined, COUNT]} {...shared}>
        <capsuleGeometry args={[0.21, 0.3, 6, 14]} />
        <meshStandardMaterial roughness={0.7} envMapIntensity={0.35} />
      </instancedMesh>
      <instancedMesh ref={head} args={[undefined, undefined, COUNT]} {...shared}>
        <sphereGeometry args={[0.19, 18, 14]} />
        <meshStandardMaterial roughness={0.55} envMapIntensity={0.35} />
      </instancedMesh>
      <instancedMesh ref={hair} args={[undefined, undefined, COUNT]} {...shared}>
        <sphereGeometry args={[0.2, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
        <meshStandardMaterial roughness={0.7} envMapIntensity={0.25} />
      </instancedMesh>
      <instancedMesh ref={eyes} args={[undefined, undefined, COUNT * 2]} {...shared}>
        <sphereGeometry args={[0.028, 8, 6]} />
        <meshBasicMaterial color="#14102a" />
      </instancedMesh>
      <instancedMesh ref={mouth} args={[undefined, undefined, COUNT]} {...shared}>
        <sphereGeometry args={[0.035, 10, 6]} />
        <meshBasicMaterial color="#5a1020" />
      </instancedMesh>
      <instancedMesh ref={scarf} args={[undefined, undefined, COUNT]} {...shared}>
        <torusGeometry args={[0.17, 0.05, 6, 16]} />
        <meshStandardMaterial roughness={0.8} />
      </instancedMesh>
      <instancedMesh ref={armL} args={[undefined, undefined, COUNT]} {...shared}>
        <capsuleGeometry args={[0.055, 0.24, 4, 8]} />
        <meshStandardMaterial roughness={0.65} envMapIntensity={0.25} />
      </instancedMesh>
      <instancedMesh ref={armR} args={[undefined, undefined, COUNT]} {...shared}>
        <capsuleGeometry args={[0.055, 0.24, 4, 8]} />
        <meshStandardMaterial roughness={0.65} envMapIntensity={0.25} />
      </instancedMesh>
      <instancedMesh ref={handL} args={[undefined, undefined, COUNT]} {...shared}>
        <sphereGeometry args={[0.07, 10, 8]} />
        <meshStandardMaterial roughness={0.6} />
      </instancedMesh>
      <instancedMesh ref={handR} args={[undefined, undefined, COUNT]} {...shared}>
        <sphereGeometry args={[0.07, 10, 8]} />
        <meshStandardMaterial roughness={0.6} />
      </instancedMesh>
      <instancedMesh ref={pole} args={[undefined, undefined, FLAGS]} {...shared}>
        <cylinderGeometry args={[0.018, 0.018, 1.7, 6]} />
        <meshStandardMaterial color="#d8d2c4" roughness={0.6} />
      </instancedMesh>
      <instancedMesh ref={cloth} args={[undefined, undefined, FLAGS]} {...shared}>
        <planeGeometry args={[0.6, 0.38]} />
        <meshStandardMaterial roughness={0.8} side={THREE.DoubleSide} emissive="#ffffff" emissiveIntensity={0.08} />
      </instancedMesh>
      <instancedMesh ref={sign} args={[undefined, undefined, SIGNS]} {...shared}>
        <boxGeometry args={[0.72, 0.42, 0.03]} />
        <meshStandardMaterial roughness={0.5} emissive="#ffffff" emissiveIntensity={0.12} />
      </instancedMesh>
    </>
  );
}
