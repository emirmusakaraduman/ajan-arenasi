/** Arena temaları: her maç numarası aynı temayı alır, arkadaşların hepsi aynı arenayı görür. */
export type Particle = "dust" | "snow" | "ember";

export type Theme = {
  key: string;
  name: string;
  sky: [string, string];
  floor: [string, string, string];
  ground: string;       // zemin dışı karanlık halka
  rim: string;          // zemin kenar çizgisi ve işaret rengi
  ring: string;         // iç çizgiler
  beam: string;         // spot ışığı
  crowd: [number, number]; // seyirci tonu aralığı (derece)
  flame: [string, string];
  glow: string;
  particle: Particle;
  cracks?: string;      // zeminde parlayan çatlaklar (lav)
};

export const THEMES: Theme[] = [
  {
    key: "colosseum", name: "Mor Meydan",
    sky: ["#1b1457", "#0d1330"], floor: ["#3a3f9c", "#222a72", "#161c52"], ground: "#0a0f2c",
    rim: "#6c5be6", ring: "#9a8cff", beam: "#c7bcff", crowd: [0, 360],
    flame: ["#ff8a3d", "#ffe07a"], glow: "#ff9a4d", particle: "dust",
  },
  {
    key: "desert", name: "Çöl Arenası",
    sky: ["#6b2f14", "#241025"], floor: ["#d9a15a", "#b57a3a", "#80522a"], ground: "#2a1a14",
    rim: "#f2c27a", ring: "#fff0c9", beam: "#ffd9a0", crowd: [15, 55],
    flame: ["#ff8a3d", "#ffe07a"], glow: "#ffb35a", particle: "dust",
  },
  {
    key: "ice", name: "Buz Mağarası",
    sky: ["#123b66", "#061427"], floor: ["#8fd8f2", "#55a3cb", "#2f6e96"], ground: "#071a2e",
    rim: "#c4f0ff", ring: "#e9fbff", beam: "#bfeeff", crowd: [185, 225],
    flame: ["#6fd3ff", "#e6fbff"], glow: "#7fdcff", particle: "snow",
  },
  {
    key: "lava", name: "Lav Çukuru",
    sky: ["#4a1010", "#12050a"], floor: ["#5e2b2c", "#3f1b20", "#26101a"], ground: "#0d0407",
    rim: "#ff6a3d", ring: "#ff9a6a", beam: "#ff9a6a", crowd: [0, 25],
    flame: ["#ff5a1f", "#ffd24a"], glow: "#ff5a1f", particle: "ember", cracks: "#ff7a2e",
  },
];

export const themeFor = (key: number) => THEMES[Math.abs(key) % THEMES.length];
