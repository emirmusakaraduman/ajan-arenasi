import type { RoundLog } from "./replay";
import { T, type Caption, type Intent, type Mood, type Title } from "./playback";

/**
 * 3B sahne zaman çizelgesi. 2B sürümle aynı tur mantığı, ama metre cinsinden dünya koordinatlarında.
 * x: sağ, y: yukarı, z: kameraya doğru. Karakterler +z yönüne bakar (yaw = 0).
 */
export const FIGHT_R = 3.15; // ajanların dizildiği çemberin yarıçapı
export const STOP = 1.75;    // saldıranın hedefe yaklaşma mesafesi
const CHEST = 1.05;          // göğüs yüksekliği

export type Agent3D = {
  x: number; z: number; yaw: number; opacity: number;
  flash: number; intent: Intent | null; intentAlpha: number; shield: number; hp: number;
  swing: number;   // -1: yok, 0..1: savurma, 1..2: dönüş
  walk: number;    // 0: duruyor, değilse yürüyüş fazı
  armUp: number; mood: Mood; fall: number; lean: number;
  recoil: number;  // vurulunca gövdenin geri sarsılması 0..1
};

export type Effect3D =
  | { type: "slash"; x: number; y: number; z: number; yaw: number; p: number; gold: boolean }
  | { type: "impact"; x: number; y: number; z: number; p: number; gold: boolean }
  | { type: "spark"; x: number; y: number; z: number; yaw: number; p: number }
  | { type: "ring"; x: number; y: number; z: number; p: number; color: string }
  | { type: "dust"; x: number; z: number; p: number; k: number }
  | { type: "num"; x: number; y: number; z: number; p: number; text: string; color: string }
  | { type: "light"; x: number; y: number; z: number; p: number; color: string };

export type Camera3D = { x: number; y: number; z: number; zoom: number; orbit: number };
export type Frame3D = {
  agents: Agent3D[]; effects: Effect3D[]; caption: Caption | null;
  vignette: { color: string; alpha: number } | null; time: number; camera: Camera3D; title: Title | null;
  hitPulse: number; // 0..1: o an vuruş şiddeti (ekran kenar bozulması için)
};

export const slotPos3 = (i: number, n: number): { x: number; z: number } => {
  // Üç ajanda ikisi önde, biri arkada durur: kamera hepsini görür
  const a = Math.PI / 2 + ((i + 0.5) * 2 * Math.PI) / n;
  return { x: FIGHT_R * Math.cos(a), z: FIGHT_R * Math.sin(a) };
};
/** Arena merkezine bakan varsayılan yön */
export const centerYaw = (x: number, z: number) => Math.atan2(-x, -z);

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const ease = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(b.x - a.x, b.z - a.z) || 1;
const intentOf = (action: number, submitted: boolean, heavy = false): Intent =>
  heavy ? "sword" : !submitted ? "idle" : action === 1 ? "sword" : action === 2 ? "heart" : action === 3 ? "steal" : action === 4 ? "charge" : action === 5 ? "pact" : "shield";
const PRIORITY = ["betrayal", "eliminated", "attack", "steal", "alliance", "pact", "blocked", "charge", "offer", "trap", "spring", "defend", "idle"];

/** a'dan b'ye dönüşte en kısa yoldan yumuşak yön geçişi */
export function turnToward(cur: number, target: number, k: number) {
  let d = target - cur;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return cur + d * k;
}

export function buildFrame3D(log: RoundLog, hpBefore: number[], names: string[], t: number, meta?: { maxRounds: number }): Frame3D {
  const n = hpBefore.length;
  const P = Array.from({ length: n }, (_, i) => slotPos3(i, n));
  const agents: Agent3D[] = hpBefore.map((hp, i) => {
    const mv = log.moves[i];
    const alive = hp > 0;
    return {
      x: P[i].x, z: P[i].z, yaw: centerYaw(P[i].x, P[i].z), opacity: 1, flash: 0,
      intent: alive ? intentOf(mv?.action ?? 0, !!mv?.submitted, log.charged?.[i] != null) : null,
      intentAlpha: alive ? seg(t, 0, 300) * (1 - seg(t, 1900, 2300)) : 0,
      shield: alive && mv?.submitted && mv.action === 0 ? seg(t, 500, 800) * (1 - seg(t, 2200, 2500)) : 0,
      hp: hpBefore[i] + (log.hpAfter[i] - hpBefore[i]) * ease(seg(t, T.hit + 80, T.hit + 600)),
      swing: -1, walk: 0, armUp: 0, mood: alive ? "idle" : "dead", fall: alive ? 0 : 1, lean: 0, recoil: 0,
    };
  });
  const effects: Effect3D[] = [];

  const go = ease(seg(t, T.moveStart, T.hit)) - ease(seg(t, T.backStart, T.backEnd));
  const moving = (t > T.moveStart && t < T.hit) || (t > T.backStart && t < T.backEnd);
  const move = (i: number, toward: number, fraction: number) => {
    const d = dist(P[i], P[toward]);
    const reach = Math.max(d - STOP, 0) * fraction;
    const ux = (P[toward].x - P[i].x) / d, uz = (P[toward].z - P[i].z) / d;
    agents[i].x += ux * reach * go;
    agents[i].z += uz * reach * go;
    if (moving && reach > 0.05) agents[i].walk = 1 + t / 95;
    if (t > T.moveStart - 200) agents[i].yaw = Math.atan2(ux, uz);
    if (reach > 0.05) {
      for (let k = 0; k < 5; k++) {
        const start = T.moveStart + k * 130;
        const gk = ease(seg(start, T.moveStart, T.hit));
        const p = seg(t, start, start + 460);
        if (p > 0 && p < 1) effects.push({ type: "dust", x: P[i].x + ux * reach * gk, z: P[i].z + uz * reach * gk, p, k });
      }
    }
  };

  let hitPulse = 0;
  for (const e of log.events) {
    if (e.kind === "defend" || e.kind === "idle" || e.kind === "eliminated") continue;
    const f = e.from, g = e.to!;
    if (e.kind === "attack" || e.kind === "betrayal" || e.kind === "blocked" || e.kind === "steal") {
      const mutual = log.events.some((x) => (x.kind === "attack" || x.kind === "betrayal" || x.kind === "blocked" || x.kind === "steal") && x.from === g && x.to === f);
      move(f, g, mutual ? 0.5 : 1);
      agents[f].swing = t < T.hit - 420 ? -1 : t < T.hit + 60 ? seg(t, T.hit - 420, T.hit + 60) : 1 + seg(t, T.hit + 300, T.hit + 800);
      if (t > T.moveStart - 100 && t < T.backStart + 300) agents[f].mood = "angry";
      const d = dist(P[f], P[g]);
      const ux = (P[g].x - P[f].x) / d, uz = (P[g].z - P[f].z) / d;
      const yaw = Math.atan2(ux, uz);
      const gold = e.kind === "betrayal";
      // hedefin yaklaşık göğüs noktası (hedef savrulmayla kayabilir)
      const tx = agents[g].x - ux * 0.3, tz = agents[g].z - uz * 0.3;
      if (e.kind === "blocked") {
        effects.push({ type: "spark", x: tx, y: CHEST, z: tz, yaw, p: seg(t, T.hit, T.hit + 380) });
        effects.push({ type: "light", x: tx, y: CHEST, z: tz, p: seg(t, T.hit, T.hit + 300), color: "#9cc4ff" });
        hitPulse = Math.max(hitPulse, 0.3 * (1 - seg(t, T.hit, T.hit + 300)) * (t >= T.hit ? 1 : 0));
      } else {
        const bump = Math.sin(Math.PI * seg(t, T.hit, T.hit + 450)) * (gold ? 0.62 : 0.4);
        agents[g].x += ux * bump;
        agents[g].z += uz * bump;
        if (t >= T.hit) {
          agents[g].flash = Math.max(agents[g].flash, 1 - seg(t, T.hit, T.hit + 450));
          agents[g].recoil = Math.max(agents[g].recoil, Math.sin(Math.PI * seg(t, T.hit, T.hit + 600)));
          agents[g].lean = agents[g].recoil;
          if (t < T.hit + 600 && agents[g].mood !== "dead") agents[g].mood = "hurt";
          agents[g].yaw = turnToward(agents[g].yaw, Math.atan2(-ux, -uz), 0.5);
          hitPulse = Math.max(hitPulse, (gold ? 1 : 0.6) * (1 - seg(t, T.hit, T.hit + 420)));
        }
        effects.push({ type: "slash", x: tx, y: CHEST, z: tz, yaw, p: seg(t, T.hit, T.hit + 330), gold });
        effects.push({ type: "impact", x: tx, y: CHEST, z: tz, p: seg(t, T.hit, T.hit + 650), gold });
        effects.push({ type: "light", x: tx, y: CHEST + 0.3, z: tz, p: seg(t, T.hit, T.hit + 380), color: gold ? "#ffcf5c" : "#ff7a6a" });
        if (gold) effects.push({ type: "ring", x: tx, y: 0.06, z: tz, p: seg(t, T.hit, T.hit + 900), color: "#ffcf5c" });
        if (e.heavy) effects.push({ type: "ring", x: tx, y: 0.06, z: tz, p: seg(t, T.hit, T.hit + 900), color: "#ff5d73" });
        const tp = seg(t, T.hit + 50, T.hit + 1000);
        if (tp > 0 && tp < 1) effects.push({ type: "num", x: agents[g].x, y: 2.2 + 0.9 * tp, z: agents[g].z, p: tp, text: `-${e.dmg}`, color: gold ? "#ffcf5c" : "#ff5d73" });
        // çalınan can hırsıza geçer
        if (e.kind === "steal" && tp > 0 && tp < 1) effects.push({ type: "num", x: agents[f].x, y: 2.2 + 0.9 * tp, z: agents[f].z, p: tp, text: "+1", color: "#4be3b0" });
      }
    } else if (e.kind === "alliance") {
      move(f, g, 0.5);
      move(g, f, 0.5);
      const up = seg(t, T.hit - 250, T.hit) * (1 - seg(t, T.hit + 700, T.hit + 1000));
      for (const k of [f, g]) {
        agents[k].armUp = Math.max(agents[k].armUp, up);
        if (t > T.hit - 100 && t < T.hit + 1000) agents[k].mood = "happy";
      }
      const mx = (agents[f].x + agents[g].x) / 2, mz = (agents[f].z + agents[g].z) / 2;
      effects.push({ type: "ring", x: mx, y: 0.06, z: mz, p: seg(t, T.hit, T.hit + 900), color: "#4be3b0" });
      effects.push({ type: "light", x: mx, y: CHEST + 0.4, z: mz, p: seg(t, T.hit, T.hit + 500), color: "#4be3b0" });
      for (const k of [f, g]) {
        const tp = seg(t, T.hit + 100, T.hit + 1000);
        if (hpBefore[k] < 10 && log.hpAfter[k] > 0 && tp > 0 && tp < 1)
          effects.push({ type: "num", x: agents[k].x, y: 2.2 + 0.9 * tp, z: agents[k].z, p: tp, text: "+1", color: "#4be3b0" });
      }
    } else if (e.kind === "offer") {
      move(f, g, 0.3);
      agents[f].armUp = Math.max(agents[f].armUp, seg(t, T.hit - 250, T.hit) * (1 - seg(t, T.hit + 600, T.hit + 900)));
    } else if (e.kind === "charge") {
      agents[f].armUp = Math.max(agents[f].armUp, seg(t, 300, 1000) * (1 - seg(t, 2200, 2600)));
      if (t > 300 && t < 2400) agents[f].mood = "angry";
      effects.push({ type: "ring", x: agents[f].x, y: 0.06, z: agents[f].z, p: seg(t, 500, 1900), color: "#ff9a4d" });
      effects.push({ type: "light", x: agents[f].x, y: CHEST, z: agents[f].z, p: seg(t, 500, 1900), color: "#ff9a4d" });
    } else if (e.kind === "pact") {
      const up = seg(t, T.hit - 250, T.hit) * (1 - seg(t, T.hit + 700, T.hit + 1000));
      agents[f].armUp = Math.max(agents[f].armUp, up);
      if (t > T.hit - 100 && t < T.hit + 1000) agents[f].mood = "happy";
      effects.push({ type: "ring", x: agents[f].x, y: 0.06, z: agents[f].z, p: seg(t, T.hit, T.hit + 900), color: "#4be3b0" });
      const tp = seg(t, T.hit + 100, T.hit + 1000);
      if (hpBefore[f] < 10 && log.hpAfter[f] > 0 && tp > 0 && tp < 1)
        effects.push({ type: "num", x: agents[f].x, y: 2.2 + 0.9 * tp, z: agents[f].z, p: tp, text: "+1", color: "#4be3b0" });
    } else if (e.kind === "trap" || e.kind === "spring") {
      const at = T.hit + 650;
      const trap = e.kind === "trap";
      if (trap) agents[f].flash = Math.max(agents[f].flash, t >= at ? 1 - seg(t, at, at + 450) : 0);
      effects.push({ type: "ring", x: agents[f].x, y: 0.06, z: agents[f].z, p: seg(t, at, at + 900), color: trap ? "#ff5d73" : "#4be3b0" });
      effects.push({ type: "light", x: agents[f].x, y: CHEST, z: agents[f].z, p: seg(t, at, at + 500), color: trap ? "#ff5d73" : "#4be3b0" });
      const tp = seg(t, at + 50, at + 1000);
      if (tp > 0 && tp < 1) effects.push({ type: "num", x: agents[f].x, y: 2.2 + 0.9 * tp, z: agents[f].z, p: tp, text: trap ? "-1" : "+1", color: trap ? "#ff5d73" : "#4be3b0" });
    }
  }

  for (const e of log.events) {
    if (e.kind !== "eliminated") continue;
    const p = seg(t, T.hit + 500, 2400);
    agents[e.from].fall = p;
    agents[e.from].mood = p > 0.15 ? "dead" : agents[e.from].mood;
    agents[e.from].opacity = 1 - 0.5 * p;
  }

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

  let vignette: Frame3D["vignette"] = null;
  if (log.events.some((e) => e.kind === "betrayal")) {
    const dark = seg(t, T.hit - 500, T.hit - 80) * (1 - seg(t, T.hit + 100, T.hit + 500));
    const flash = t >= T.hit ? 1 - seg(t, T.hit, T.hit + 700) : 0;
    vignette = flash > dark ? { color: "#ffcf5c", alpha: flash * 0.5 } : { color: "#05071a", alpha: dark * 0.55 };
  }

  // Kamera: önemli olaya yaklaşır; ihanette biraz yörüngede döner
  const focusEv = log.events.find((e) => e.kind === "betrayal") ?? log.events.find((e) => e.kind === "attack") ?? log.events.find((e) => e.kind === "blocked") ?? log.events.find((e) => e.kind === "alliance");
  const camera: Camera3D = { x: 0, y: 0.9, z: 0, zoom: 1, orbit: 0 };
  if (focusEv && focusEv.to !== undefined) {
    const zmax = focusEv.kind === "betrayal" ? 1.75 : focusEv.kind === "attack" ? 1.5 : 1.28;
    const bell = ease(seg(t, T.moveStart, T.hit)) * (1 - ease(seg(t, T.hit + 350, T.backEnd)));
    const a = agents[focusEv.from], b = agents[focusEv.to];
    camera.x = ((a.x + b.x) / 2) * bell;
    camera.z = ((a.z + b.z) / 2) * bell;
    camera.y = 0.9 + 0.1 * bell;
    camera.zoom = 1 + (zmax - 1) * bell;
    camera.orbit = (focusEv.kind === "betrayal" ? 0.55 : 0.22) * bell * (P[focusEv.from].x < P[focusEv.to].x ? 1 : -1);
  }

  const last = meta && log.round + 1 === meta.maxRounds;
  const ta = seg(t, 0, 140) * (1 - seg(t, 640, 900));
  const title: Title | null = ta > 0.01 ? { text: last ? "Son tur" : `Tur ${log.round + 1}`, alpha: ta, scale: 1 + 0.9 * (1 - ease(seg(t, 0, 260))) } : null;

  return { agents, effects, caption, vignette, time: t, camera, title, hitPulse };
}
