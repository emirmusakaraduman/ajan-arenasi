"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type * as THREE from "three";

/** Görsel efekt katmanı. Ana kamera bu katmanı da görür, zemin gölgesi (ContactShadows) görmez. */
export const FX_LAYER = 1;

/**
 * İçindeki her şeyi efekt katmanına taşır: parçacıklar, kıvılcımlar ve savurma izleri zemine sahte koyu gölge bırakmaz.
 * Çocuklar sonradan eklenebildiği için her karede kontrol edilir; zaten taşınmışsa dokunulmaz.
 */
export function FxLayer({ children }: { children: ReactNode }) {
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    g.current?.traverse((o) => {
      if (o.layers.mask !== 1 << FX_LAYER) o.layers.set(FX_LAYER);
    });
  });
  return <group ref={g}>{children}</group>;
}

/** Ana kameranın efekt katmanını da çizmesini sağlar */
export function SeeFx() {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    camera.layers.enable(FX_LAYER);
  }, [camera]);
  return null;
}
