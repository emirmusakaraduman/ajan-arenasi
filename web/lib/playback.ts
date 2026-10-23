import type { RoundLog } from "./replay";

/** Bir turun sahnesi: zamanın saf fonksiyonu. t = turun başlangıcından beri ms. */
export const DURATION = 3000;

// Sahne: 800x500, ajanlar yere yatık bir elips üzerinde (3/4 görünüm) dizilir
export const W = 800;
export const H = 500;
export const FLOOR = { cx: 400, cy: 338, rx: 300, ry: 100 };

export const T = { stanceEnd: 600, moveStart: 700, hit: 1400, backStart: 1650, backEnd: 2250 };

export type Intent = "sword" | "shield" | "heart" | "idle" | "steal" | "charge" | "pact";
export type Mood = "idle" | "angry" | "hurt" | "happy" | "dead";
export type Pt = { x: number; y: number };

export type AgentFrame = {
  dx: number; dy: number; opacity: number;
  flash: number;        // vurulunca 1'den 0'a
  intent: Intent | null; intentAlpha: number;
  shield: number;       // 0..1
  hp: number;           // akıcı can
  facing: 1 | -1;
  swing: number;        // -1: yok, 0..1: savurma, 1..2: eski duruşa dönüş
  walk: number;         // 0: duruyor, değilse yürüyüş fazı
  armUp: number;        // 0..1: kol havada (ittifak, teklif)
  mood: Mood;
  fall: number;         // 0..1: eleninin yere yıkılması
  lean: number;         // vurulunca geri yaslanma, -1..1
};
export type Effect =
  | { type: "slash"; x: number; y: number; p: number; gold: boolean; dir: 1 | -1 }
  | { type: "star"; x: number; y: number; p: number; gold: boolean }
  | { type: "spark"; x: number; y: number; p: number }
  | { type: "text"; x: number; y: number; p: number; text: string; color: string }
  | { type: "burst"; x: number; y: number; p: number; color: string }
  | { type: "dust"; x: number; y: number; p: number; k: number };
export type Caption = { text: string; tone: "hit" | "gold" | "ally" | "mute"; alpha: number };
export type Camera = { x: number; y: number; zoom: number }; // x,y: odaklanılan sahne noktası
export type Title = { text: string; alpha: number; scale: number };
export type Frame = {
  agents: AgentFrame[]; effects: Effect[]; caption: Caption | null;
  vignette: { color: string; alpha: number } | null; time: number;
  camera: Camera; title: Title | null;
};

export const HUES = [262, 205, 330, 38, 165, 95];
/** Her ajanın kimlik rengi: karakter, konuşma satırı ve akışta aynı */
export const slotColor = (i: number, light = 38) => `hsl(${HUES[i % HUES.length]} 55% ${light}%)`;

/** Ayak noktası. Aynı elipste eşit aralıkla dizilir; 2 ajanda yüz yüze, 3'te üçgen. */
export const slotPos = (i: number, n: number): Pt => {
  const a = -Math.PI / 2 + ((i + 0.5) * 2 * Math.PI) / n;
  return { x: FLOOR.cx + FLOOR.rx * Math.cos(a), y: FLOOR.cy + FLOOR.ry * Math.sin(a) };
};
/** Derinlik ölçeği: arkadaki küçük, öndeki büyük */
export const depthScale = (y: number) => 0.72 + 0.28 * Math.min(1, Math.max(0, (y - (FLOOR.cy - FLOOR.ry)) / (2 * FLOOR.ry)));

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const ease = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y) || 1;

const intentOf = (action: number, submitted: boolean, heavy = false): Intent =>
  heavy ? "sword" : !submitted ? "idle" : action === 1 ? "sword" : action === 2 ? "heart" : action === 3 ? "steal" : action === 4 ? "charge" : action === 5 ? "pact" : "shield";

const PRIORITY = ["betrayal", "eliminated", "attack", "steal", "alliance", "pact", "blocked", "charge", "offer", "trap", "spring", "defend", "idle"];
const STOP = 105; // saldıranın hedefe yaklaşma mesafesi (ekran pikseli)

/** Ağır çekim: ihanet darbesinde yavaşlar, normal vuruşta kısa bir donma yaşanır */
export function timeScale(log: RoundLog, t: number): number {
  if (log.events.some((e) => e.kind === "betrayal") && t > T.hit - 350 && t < T.hit + 500) return 0.35;
  if (log.events.some((e) => e.kind === "attack" || e.kind === "blocked" || e.kind === "steal") && t > T.hit - 40 && t < T.hit + 100) return 0.22;
  return 1;
}

export function buildFrame(log: RoundLog, hpBefore: number[], names: string[], t: number, meta?: { maxRounds: number }): Frame {
  const n = hpBefore.length;
  const P = Array.from({ length: n }, (_, i) => slotPos(i, n));
  const S = P.map((p) => depthScale(p.y));
  const chest = (i: number): Pt => ({ x: P[i].x, y: P[i].y - 52 * S[i] });
  const agents: AgentFrame[] = hpBefore.map((hp, i) => {
    const mv = log.moves[i];
    const alive = hp > 0;
    return {
      dx: 0, dy: 0, opacity: 1, flash: 0,
      intent: alive ? intentOf(mv?.action ?? 0, !!mv?.submitted, log.charged?.[i] != null) : null,
      intentAlpha: alive ? seg(t, 0, 300) * (1 - seg(t, 1900, 2300)) : 0,
      shield: alive && mv?.submitted && mv.action === 0 ? seg(t, 500, 800) * (1 - seg(t, 2200, 2500)) : 0,
      hp: hpBefore[i] + (log.hpAfter[i] - hpBefore[i]) * ease(seg(t, T.hit + 80, T.hit + 600)),
      facing: P[i].x <= FLOOR.cx ? 1 : -1,
      swing: -1, walk: 0, armUp: 0,
      mood: alive ? "idle" : "dead",
      fall: alive ? 0 : 1, lean: 0,
    };
  });
  const effects: Effect[] = [];

  // Atılma ve geri dönüş eğrisi
  const go = ease(seg(t, T.moveStart, T.hit)) - ease(seg(t, T.backStart, T.backEnd));
  const moving = (t > T.moveStart && t < T.hit) || (t > T.backStart && t < T.backEnd);
  const move = (i: number, toward: number, fraction: number) => {
    const d = dist(P[i], P[toward]);
    const reach = Math.max(d - STOP, 0) * fraction;
    agents[i].dx += ((P[toward].x - P[i].x) / d) * reach * go;
    agents[i].dy += ((P[toward].y - P[i].y) / d) * reach * go;
    if (moving && reach > 1) agents[i].walk = 1 + t / 95;
    // Koşarken ayak altında toz bulutları
    if (reach > 1) {
      for (let k = 0; k < 5; k++) {
        const start = T.moveStart + k * 130;
        const gk = ease(seg(start, T.moveStart, T.hit));
        const p = seg(t, start, start + 460);
        if (p > 0 && p < 1)
          effects.push({ type: "dust", x: P[i].x + ((P[toward].x - P[i].x) / d) * reach * gk, y: P[i].y + ((P[toward].y - P[i].y) / d) * reach * gk, p, k });
      }
    }
    if (Math.abs(P[toward].x - P[i].x) > 8 && t > T.moveStart - 150) agents[i].facing = P[toward].x > P[i].x ? 1 : -1;
  };

  for (const e of log.events) {
    if (e.kind === "defend" || e.kind === "idle" || e.kind === "eliminated") continue;
    const f = e.from, g = e.to!;
    if (e.kind === "attack" || e.kind === "betrayal" || e.kind === "blocked" || e.kind === "steal") {
      // karşılıklı saldırıda ikisi de yolun yarısını yürür, üst üste binmezler
      const mutual = log.events.some((x) => (x.kind === "attack" || x.kind === "betrayal" || x.kind === "blocked" || x.kind === "steal") && x.from === g && x.to === f);
      move(f, g, mutual ? 0.5 : 1);
      // 0..1 savurma, 1..2 kılıcı indirip eski duruşa dönüş, -1 savurmuyor
      agents[f].swing = t < T.hit - 420 ? -1 : t < T.hit + 60 ? seg(t, T.hit - 420, T.hit + 60) : 1 + seg(t, T.hit + 300, T.hit + 800);
      if (t > T.moveStart - 100 && t < T.backStart + 300) agents[f].mood = "angry";
      const d = dist(P[f], P[g]);
      const ux = (P[g].x - P[f].x) / d, uy = (P[g].y - P[f].y) / d;
      const dir: 1 | -1 = P[g].x >= P[f].x ? 1 : -1;
      if (e.kind === "blocked") {
        const c = chest(g);
        effects.push({ type: "spark", x: c.x - ux * 34, y: c.y - uy * 18, p: seg(t, T.hit, T.hit + 380) });
      } else {
        const gold = e.kind === "betrayal";
        const bump = Math.sin(Math.PI * seg(t, T.hit, T.hit + 450)) * (gold ? 20 : 12);
        agents[g].dx += ux * bump;
        agents[g].dy += uy * bump * 0.5;
        if (t >= T.hit) {
          agents[g].flash = Math.max(agents[g].flash, 1 - seg(t, T.hit, T.hit + 450));
          agents[g].lean = Math.max(agents[g].lean, Math.sin(Math.PI * seg(t, T.hit, T.hit + 600)));
          if (t < T.hit + 600 && agents[g].mood !== "dead") agents[g].mood = "hurt";
        }
        const c = chest(g);
        effects.push({ type: "slash", x: c.x, y: c.y, p: seg(t, T.hit, T.hit + 320), gold, dir });
        effects.push({ type: "star", x: c.x, y: c.y, p: seg(t, T.hit, T.hit + 420), gold });
        if (gold) effects.push({ type: "burst", x: c.x, y: c.y, p: seg(t, T.hit, T.hit + 800), color: "#ffcf5c" });
        if (e.heavy) effects.push({ type: "burst", x: c.x, y: c.y, p: seg(t, T.hit, T.hit + 800), color: "#ff5d73" });
        const tp = seg(t, T.hit + 50, T.hit + 1000);
        if (tp > 0 && tp < 1)
          effects.push({ type: "text", x: P[g].x, y: P[g].y - 130 * S[g] - 40 * tp, p: tp, text: `-${e.dmg}`, color: gold ? "#ffcf5c" : "#ff5d73" });
        // çalınan can hırsıza geçer
        if (e.kind === "steal" && tp > 0 && tp < 1)
          effects.push({ type: "text", x: P[f].x, y: P[f].y - 130 * S[f] - 40 * tp, p: tp, text: "+1", color: "#4be3b0" });
      }
    } else if (e.kind === "alliance") {
      move(f, g, 0.5);
      move(g, f, 0.5);
      const up = seg(t, T.hit - 250, T.hit) * (1 - seg(t, T.hit + 700, T.hit + 1000));
      for (const k of [f, g]) {
        agents[k].armUp = Math.max(agents[k].armUp, up);
        if (t > T.hit - 100 && t < T.hit + 1000) agents[k].mood = "happy";
      }
      const mid = { x: (chest(f).x + chest(g).x) / 2, y: (chest(f).y + chest(g).y) / 2 - 10 };
      effects.push({ type: "burst", x: mid.x, y: mid.y, p: seg(t, T.hit, T.hit + 800), color: "#4be3b0" });
      for (const k of [f, g]) {
        const tp = seg(t, T.hit + 100, T.hit + 1000);
        if (hpBefore[k] < 10 && log.hpAfter[k] > 0 && tp > 0 && tp < 1)
          effects.push({ type: "text", x: P[k].x, y: P[k].y - 130 * S[k] - 40 * tp, p: tp, text: "+1", color: "#4be3b0" });
      }
    } else if (e.kind === "offer") {
      move(f, g, 0.3);
      agents[f].armUp = Math.max(agents[f].armUp, seg(t, T.hit - 250, T.hit) * (1 - seg(t, T.hit + 600, T.hit + 900)));
    } else if (e.kind === "charge") {
      // güç topluyor: kol havada, kızgın, göğsünde büyüyen kırmızı patlama
      agents[f].armUp = Math.max(agents[f].armUp, seg(t, 300, 1000) * (1 - seg(t, 2200, 2600)));
      if (t > 300 && t < 2400) agents[f].mood = "angry";
      const c = chest(f);
      effects.push({ type: "burst", x: c.x, y: c.y, p: seg(t, 500, 1900), color: "#ff9a4d" });
    } else if (e.kind === "pact") {
      const up = seg(t, T.hit - 250, T.hit) * (1 - seg(t, T.hit + 700, T.hit + 1000));
      agents[f].armUp = Math.max(agents[f].armUp, up);
      if (t > T.hit - 100 && t < T.hit + 1000) agents[f].mood = "happy";
      const c = chest(f);
      effects.push({ type: "burst", x: c.x, y: c.y, p: seg(t, T.hit, T.hit + 800), color: "#4be3b0" });
      const tp = seg(t, T.hit + 100, T.hit + 1000);
      if (hpBefore[f] < 10 && log.hpAfter[f] > 0 && tp > 0 && tp < 1)
        effects.push({ type: "text", x: P[f].x, y: P[f].y - 130 * S[f] - 40 * tp, p: tp, text: "+1", color: "#4be3b0" });
    } else if (e.kind === "trap" || e.kind === "spring") {
      // turun sonunda arena olayı
      const at = T.hit + 650;
      const c = chest(f);
      const trap = e.kind === "trap";
      if (trap) agents[f].flash = Math.max(agents[f].flash, t >= at ? 1 - seg(t, at, at + 450) : 0);
      effects.push({ type: "burst", x: c.x, y: c.y, p: seg(t, at, at + 800), color: trap ? "#ff5d73" : "#4be3b0" });
      const tp = seg(t, at + 50, at + 1000);
      if (tp > 0 && tp < 1) effects.push({ type: "text", x: P[f].x, y: P[f].y - 130 * S[f] - 40 * tp, p: tp, text: trap ? "-1" : "+1", color: trap ? "#ff5d73" : "#4be3b0" });
    }
  }

  for (const e of log.events) {
    if (e.kind !== "eliminated") continue;
    const p = seg(t, T.hit + 500, 2400);
    agents[e.from].fall = p;
    agents[e.from].mood = p > 0.15 ? "dead" : agents[e.from].mood;
    agents[e.from].opacity = 1 - 0.55 * p;
  }

  // Ortadaki başlık: en önemli olay
  const top = [...log.events].sort((a, b) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind))[0];
  let caption: Caption | null = null;
  if (top) {
    const a = names[top.from], b = top.to !== undefined ? names[top.to] : "";
    const alpha = seg(t, T.hit - 200, T.hit + 100) * (1 - seg(t, 2500, 2900));
    const map: Record<string, Omit<Caption, "alpha">> = {
      betrayal: { text: top.heavy ? `Ağır ihanet! ${a} saldırdı, hedef ${b}` : `İhanet! ${a} saldırdı, hedef ${b}`, tone: "gold" },
      eliminated: { text: `${a} elendi`, tone: "hit" },
      attack: { text: top.heavy ? `Ağır saldırı! ${a} vurdu, hedef ${b}` : `${a} saldırdı, hedef ${b}`, tone: "hit" },
      steal: { text: `${a}, ${b} ajanından can çaldı`, tone: "hit" },
      charge: { text: `${a} güç topluyor, sonraki tur ağır vuracak`, tone: "gold" },
      pact: { text: "Toplu ittifak kuruldu", tone: "ally" },
      trap: { text: `Arena tuzağı! ${a} can kaybetti`, tone: "hit" },
      spring: { text: `Şifa pınarı: ${a} can kazandı`, tone: "ally" },
      alliance: { text: `${a} ve ${b} ittifak kurdu`, tone: "ally" },
      blocked: { text: `${b} saldırıyı savundu`, tone: "mute" },
      offer: { text: `${a} ittifak teklif etti, karşılık yok`, tone: "mute" },
      defend: { text: "Bu tur sessiz geçti", tone: "mute" },
      idle: { text: `${a} hamlesini açmadı`, tone: "mute" },
    };
    caption = { ...map[top.kind], alpha };
  }

  // İhanette ekran kararır, vuruşta altın parlar
  let vignette: Frame["vignette"] = null;
  if (log.events.some((e) => e.kind === "betrayal")) {
    const dark = seg(t, T.hit - 500, T.hit - 80) * (1 - seg(t, T.hit + 100, T.hit + 500));
    const flash = t >= T.hit ? 1 - seg(t, T.hit, T.hit + 700) : 0;
    vignette = flash > dark ? { color: "#ffcf5c", alpha: flash * 0.5 } : { color: "#05071a", alpha: dark * 0.55 };
  }

  // Kamera: önemli olaya yaklaşır, vuruştan sonra geri açılır
  const focusEv = log.events.find((e) => e.kind === "betrayal") ?? log.events.find((e) => e.kind === "attack") ?? log.events.find((e) => e.kind === "blocked") ?? log.events.find((e) => e.kind === "alliance");
  const camera: Camera = { x: W / 2, y: H / 2, zoom: 1 };
  if (focusEv && focusEv.to !== undefined) {
    const zmax = focusEv.kind === "betrayal" ? 1.34 : focusEv.kind === "attack" ? 1.22 : 1.14;
    const bell = ease(seg(t, T.moveStart, T.hit)) * (1 - ease(seg(t, T.hit + 250, T.backEnd)));
    const a = chest(focusEv.from), b = chest(focusEv.to);
    const fx = (a.x + b.x) / 2, fy = (a.y + b.y) / 2;
    camera.x = W / 2 + (fx - W / 2) * bell;
    camera.y = H / 2 + (fy - H / 2) * bell;
    camera.zoom = 1 + (zmax - 1) * bell;
  }

  // Tur kartı
  const last = meta && log.round + 1 === meta.maxRounds;
  const ta = seg(t, 0, 140) * (1 - seg(t, 640, 900));
  const title: Title | null = ta > 0.01 ? { text: last ? "Son tur" : `Tur ${log.round + 1}`, alpha: ta, scale: 1 + 0.9 * (1 - ease(seg(t, 0, 260))) } : null;

  return { agents, effects, caption, vignette, time: t, camera, title };
}

/** Turun ses ve sarsıntı ipuçları: at = turun başlangıcından ms, shake = ekran sarsıntı gücü */
export type Cue = { at: number; sound: "tick" | "hit" | "block" | "betray" | "chime" | "fall"; shake: number };

export function cuesFor(log: RoundLog): Cue[] {
  const cues: Cue[] = [{ at: 350, sound: "tick", shake: 0 }];
  const add = (c: Cue) => {
    // aynı anda aynı ses katlanıp gürültü olmasın: birleştir, sarsıntıyı büyüğü belirler
    const same = cues.find((x) => x.sound === c.sound && x.at === c.at);
    if (same) same.shake = Math.max(same.shake, c.shake);
    else cues.push(c);
  };
  for (const e of log.events) {
    if (e.kind === "attack") add({ at: T.hit, sound: "hit", shake: e.heavy ? 2.2 : 1 });
    else if (e.kind === "steal") add({ at: T.hit, sound: "hit", shake: 0.6 });
    else if (e.kind === "pact") add({ at: T.hit, sound: "chime", shake: 0 });
    else if (e.kind === "trap") add({ at: T.hit + 650, sound: "hit", shake: 0.6 });
    else if (e.kind === "spring") add({ at: T.hit + 650, sound: "chime", shake: 0 });
    else if (e.kind === "betrayal") add({ at: T.hit, sound: "betray", shake: e.heavy ? 3 : 2.2 });
    else if (e.kind === "blocked") add({ at: T.hit, sound: "block", shake: 0.3 });
    else if (e.kind === "alliance") add({ at: T.hit, sound: "chime", shake: 0 });
    else if (e.kind === "eliminated") add({ at: T.hit + 500, sound: "fall", shake: 1.4 });
  }
  return cues.sort((a, b) => a.at - b.at);
}
