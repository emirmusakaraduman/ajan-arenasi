"use client";

/** Dosyasız ses efektleri: hepsi Web Audio ile anlık sentezlenir. */
export type Sound = "tick" | "hit" | "block" | "betray" | "chime" | "fall";

let ctx: AudioContext | null = null;
let muted = false;
let loaded = false;

const KEY = "arena-muted";

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    muted = window.localStorage.getItem(KEY) === "1";
  } catch {}
  // Tarayıcılar sesi ilk tıklamaya kadar kilitler; tıklayınca aç
  window.addEventListener("pointerdown", () => ctx?.resume(), { passive: true });
}

export const isMuted = () => {
  load();
  return muted;
};

export function setMuted(v: boolean) {
  load();
  muted = v;
  try {
    window.localStorage.setItem(KEY, v ? "1" : "0");
  } catch {}
}

function audio(): AudioContext | null {
  load();
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext ?? (window as any).webkitAudioContext;
  if (!AC) return null;
  ctx ??= new AC();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function noise(c: AudioContext, dur: number) {
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  return src;
}

function env(c: AudioContext, g: GainNode, peak: number, dur: number, at = 0) {
  const t = c.currentTime + at;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}

function tone(c: AudioContext, type: OscillatorType, f0: number, f1: number, dur: number, peak: number, at = 0, dest: AudioNode = c.destination) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  const t = c.currentTime + at;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
  env(c, g, peak, dur, at);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function burst(c: AudioContext, dur: number, cutoff: number, peak: number, kind: BiquadFilterType = "lowpass", at = 0) {
  const n = noise(c, dur);
  const f = c.createBiquadFilter();
  const g = c.createGain();
  f.type = kind;
  f.frequency.value = cutoff;
  env(c, g, peak, dur, at);
  n.connect(f).connect(g).connect(c.destination);
  n.start(c.currentTime + at);
}

export function play(sound: Sound) {
  if (muted) return;
  const c = audio();
  if (!c) return;
  switch (sound) {
    case "tick":
      tone(c, "square", 900, 700, 0.04, 0.03);
      break;
    case "hit":
      burst(c, 0.14, 1600, 0.5);
      tone(c, "sine", 130, 45, 0.22, 0.7);
      break;
    case "block":
      tone(c, "triangle", 2100, 1700, 0.22, 0.25);
      tone(c, "triangle", 3100, 2500, 0.16, 0.15);
      burst(c, 0.05, 5000, 0.2, "highpass");
      break;
    case "betray":
      burst(c, 0.22, 2200, 0.6);
      tone(c, "sawtooth", 120, 50, 0.7, 0.3);
      tone(c, "sine", 440, 430, 0.6, 0.12, 0.02);
      tone(c, "sine", 622, 610, 0.6, 0.12, 0.02); // tritone: gerilim
      tone(c, "sine", 70, 35, 0.8, 0.8, 0.0);
      break;
    case "chime":
      tone(c, "sine", 660, 660, 0.35, 0.2);
      tone(c, "sine", 880, 880, 0.45, 0.2, 0.12);
      tone(c, "sine", 1320, 1320, 0.5, 0.08, 0.12);
      break;
    case "fall":
      tone(c, "sine", 320, 70, 0.6, 0.3);
      burst(c, 0.2, 500, 0.25, "lowpass", 0.05);
      break;
  }
}

// ---------------------------------------------------------------------------------------------
// Müzik: Web Audio ile üretilen döngü (la minör: Am F C G). Dövüşte tempo ve vurucular açılır.
// ---------------------------------------------------------------------------------------------
const MKEY = "arena-music-v2"; // v2: müzik artık varsayılan olarak kapalı
let musicWanted = false;
let musicLoaded = false;
let timer: ReturnType<typeof setInterval> | null = null;
let master: GainNode | null = null;
let nextTime = 0;
let step = 0;
let intensity = 0.35;

const CHORDS = [
  [110, 130.81, 164.81], // Am
  [87.31, 110, 130.81], // F
  [130.81, 164.81, 196], // C
  [98, 123.47, 146.83], // G
];
const ARP = [0, 1, 2, 1, 2, 1, 0, 2];

function loadMusicPref() {
  if (musicLoaded || typeof window === "undefined") return;
  musicLoaded = true;
  try {
    musicWanted = window.localStorage.getItem(MKEY) === "1";
  } catch {}
}

export const isMusicOn = () => {
  loadMusicPref();
  return musicWanted;
};

export function setMusicIntensity(v: number) {
  intensity = Math.min(1, Math.max(0, v));
}

function pad(c: AudioContext, dest: AudioNode, freq: number, at: number, dur: number) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "triangle";
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(0.5, at + dur * 0.35);
  g.gain.linearRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(dest);
  o.start(at);
  o.stop(at + dur + 0.05);
}

function pluck(c: AudioContext, dest: AudioNode, freq: number, at: number, peak: number, type: OscillatorType = "sine", dur = 0.35) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(dest);
  o.start(at);
  o.stop(at + dur + 0.05);
}

function kick(c: AudioContext, dest: AudioNode, at: number, peak: number) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.frequency.setValueAtTime(140, at);
  o.frequency.exponentialRampToValueAtTime(42, at + 0.14);
  g.gain.setValueAtTime(peak, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
  o.connect(g).connect(dest);
  o.start(at);
  o.stop(at + 0.25);
}

function hat(c: AudioContext, dest: AudioNode, at: number, peak: number) {
  const n = noise(c, 0.04);
  const f = c.createBiquadFilter();
  const g = c.createGain();
  f.type = "highpass";
  f.frequency.value = 7000;
  g.gain.setValueAtTime(peak, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.04);
  n.connect(f).connect(g).connect(dest);
  n.start(at);
}

function schedule() {
  const c = ctx;
  if (!c || !master || c.state !== "running") return;
  const STEP = 60 / (92 + intensity * 24) / 2; // 8'lik nota süresi
  while (nextTime < c.currentTime + 0.6) {
    const bar = Math.floor(step / 8) % 8;
    const chord = CHORDS[Math.floor(bar / 2)];
    const s = step % 8;
    if (step % 16 === 0) for (const f of chord) pad(c, master, f, nextTime, STEP * 16 + 0.4);
    if (s % 4 === 0) pluck(c, master, chord[0] / 2, nextTime, 0.5, "triangle", STEP * 3);
    pluck(c, master, chord[ARP[s] % 3] * 4, nextTime, 0.07 + intensity * 0.06, "sine", STEP * 1.6);
    if (intensity > 0.45 && s % 4 === 0) kick(c, master, nextTime, 0.55 * intensity);
    if (intensity > 0.6 && s % 2 === 1) hat(c, master, nextTime, 0.12 * intensity);
    nextTime += STEP;
    step++;
  }
}

export function startMusic() {
  loadMusicPref();
  musicWanted = true;
  try {
    window.localStorage.setItem(MKEY, "1");
  } catch {}
  const c = audio();
  if (!c || timer) return;
  master = c.createGain();
  master.gain.value = 0.14;
  master.connect(c.destination);
  nextTime = c.currentTime + 0.1;
  step = 0;
  timer = setInterval(schedule, 200);
}

export function stopMusic() {
  loadMusicPref();
  musicWanted = false;
  try {
    window.localStorage.setItem(MKEY, "0");
  } catch {}
  if (timer) clearInterval(timer);
  timer = null;
  if (master) {
    master.gain.setTargetAtTime(0.0001, ctx!.currentTime, 0.2);
    const m = master;
    setTimeout(() => m.disconnect(), 800);
  }
  master = null;
}
