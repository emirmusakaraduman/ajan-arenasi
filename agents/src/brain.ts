import Anthropic from "@anthropic-ai/sdk";
import { instinct, speech, type Rand } from "./instinct.js";
import type { Facts } from "./memory.js";

/** 0 Defend, 1 Attack, 2 Ally; gelişmiş maçlarda 3 Steal, 4 Charge, 5 Pact */
export type Action = 0 | 1 | 2 | 3 | 4 | 5;

export interface Opponent {
  slot: number;
  name: string;
  hp: number;
  /** bu tur zaten ağır saldırı hazırlıyor (sonraki tur kendiliğinden vuracak) */
  charging?: boolean;
}

export interface Chat {
  slot: number;
  name: string;
  text: string;
}

export interface Observation {
  round: number;
  mySlot: number;
  myHp: number;
  opponents: Opponent[];
  /** önceki turlarda herkesin yaptığı hamleler, ajan hafızası olarak */
  history: string[];
  /** bu turda hamle öncesi herkese açık pazarlık mesajları */
  messages: Chat[];
  /** maçta Çal / Güç topla / Pakt hamleleri açık mı */
  advanced?: boolean;
  /** her tur sonunda rastgele arena olayı (tuzak/şifa pınarı) var mı */
  events?: boolean;
  /** önceki maçlardan kalan dersler (kim ihanet etti, kiminle ittifak işe yaradı) */
  memory?: string[];
  /** aynı dersler yapılandırılmış olarak (yedek beyin bunları kullanır) */
  facts?: Facts;
  /** bu ajanın adı: geçmişteki kendi hamlelerini tanımak için */
  myName?: string;
}

export interface Persona {
  name: string;
  persona: string;
  strategy: string;
}

export interface Decision {
  action: Action;
  target: number;
  reason: string;
}

const BASE_RULES = `Sen bir arenada hayatta kalmaya çalışan yapay zeka ajanısın. Herkesin 10 canı var.
Her tur eş zamanlı bir hamle seçersin:
- DEFEND (0): bu tur sana gelen saldırıları engeller.
- ATTACK (1) hedef: hedef savunmuyorsa 2 can götürür. Hedef sana ittifak teklif ediyorsa 4 can götürür (ihanet).
- ALLY (2) hedef: hedef de sana ALLY derse ikiniz de 1 can kazanırsınız. Hedef sana saldırırsa 4 can kaybedersin.`;

const ADVANCED_RULES = `Bu maçta ek hamleler de açık:
- STEAL (3) hedef: hedef savunmuyorsa 1 canını çalarsın (sen +1, hedef -1). Hedef savunuyorsa boşa gider.
- CHARGE (4) hedef: bu tur savunmasız kalırsın. Sonraki tur hamle vermeden hedefe otomatik ağır saldırı vurursun: 4 hasar, savunuyorsa 1 hasar, ittifak teklif ediyorsa 6 hasar. Hedef sonraki turda ölürse boşa gider.
- PACT (5) (hedef yok, target olarak kendi slotunu yaz): bu turda en az 3 ajan PACT seçerse hepsi +1 can kazanır; ama paktta olan birine saldıran 4 hasar (ihanet) vurur. 3'ten az olursa pakt savunma sayılır.`;

const EVENT_RULES = `Her tur sonunda %50 olasılıkla arena olayı olur: tuzak (savunmayan rastgele bir ajan -1 can, öldürmez) ya da şifa pınarı (rastgele ajan +1 can).`;

const TAIL = `Hamle vermeden önce herkese açık mesaj yazabilirsin; mesajlar bağlayıcı değildir, yalan söylemek serbesttir. Son hayatta kalan veya tur sonunda en çok canı olan kazanır. Yalnızca JSON döndür:`;

/** Maç kurallarına göre sistem istemi */
export function rulesFor(obs: Pick<Observation, "advanced" | "events">): string {
  const shape = obs.advanced
    ? `{"action":0|1|2|3|4|5,"target":<slot>,"reason":"<tek cümle, oyuncu konuşması gibi>"}`
    : `{"action":0|1|2,"target":<slot>,"reason":"<tek cümle, oyuncu konuşması gibi>"}`;
  return [BASE_RULES, obs.advanced ? ADVANCED_RULES : "", obs.events ? EVENT_RULES : "", `${TAIL}\n${shape}`].filter(Boolean).join("\n");
}

// Tur süresi kısıtlı: LLM yanıtı takılırsa beklemeyiz, yedek davranış devreye girer (hamle kaçmaz).
// ANTHROPIC_API_KEY tanımlı değilse hiç LLM çağrısı yapılmaz: demo modunda ajanlar yalnızca yedek beyinle (instinct.ts) oynar.
const client = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ timeout: Number(process.env.LLM_TIMEOUT_MS ?? 15_000), maxRetries: 1 })
  : null;

/** Hedef gerektiren hamleler */
const needsTarget = (a: number) => a === 1 || a === 2 || a === 3 || a === 4;

/** LLM yanıtı geçerli mi? Maç kurallarına uymayan hamle yedek davranışa düşer. */
export function validate(obs: Observation, action: number, target: number): boolean {
  const max = obs.advanced ? 5 : 2;
  if (!Number.isInteger(action) || action < 0 || action > max) return false;
  if (!needsTarget(action)) return true;
  return obs.opponents.some((o) => o.slot === target && o.hp > 0);
}

/** LLM anahtarı yoksa ya da yanıt bozuksa kullanılan yedek beyin: kişilik, hafıza ve son turdan karar verir. */
export function fallback(obs: Observation, p?: Persona, rand?: Rand): Decision {
  return instinct(obs, p, rand);
}

const memoryBlock = (obs: Observation) =>
  obs.memory?.length ? `\nÖnceki maçlardan hafızan:\n${obs.memory.map((m) => `- ${m}`).join("\n")}` : "";

export async function decide(p: Persona, obs: Observation): Promise<Decision> {
  if (!client) return fallback(obs, p);
  const prompt = `Adın: ${p.name}\nKişiliğin: ${p.persona}\nStratejin: ${p.strategy}${memoryBlock(obs)}\n\nTur: ${obs.round}\nSenin slotun: ${obs.mySlot}, canın: ${obs.myHp}\nRakipler: ${JSON.stringify(
    obs.opponents,
  )}\nBu turun mesajları:\n${obs.messages.map((m) => `${m.name}: ${m.text}`).join("\n") || "(yok)"}\nGeçmiş:\n${obs.history.slice(-12).join("\n") || "(yok)"}`;
  try {
    const res = await client.messages.create({
      model: process.env.AGENT_MODEL ?? "claude-haiku-5-5",
      max_tokens: 200,
      system: rulesFor(obs),
      messages: [{ role: "user", content: prompt }],
    });
    const text = res.content.map((c) => (c.type === "text" ? c.text : "")).join("");
    const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    const action = Number(json.action);
    const target = Number(json.target);
    if (!validate(obs, action, target)) return fallback(obs, p);
    return { action: action as Action, target: needsTarget(action) ? target : obs.mySlot, reason: String(json.reason ?? "") };
  } catch {
    return fallback(obs, p);
  }
}

const TALK = `Sen bir arenada hayatta kalmaya çalışan yapay zeka ajanısın. Hamle vermeden önce rakiplerin hepsinin okuduğu TEK kısa mesaj yaz (en çok 120 karakter, Türkçe, konuşma dili): ittifak teklifi, tehdit, blöf ya da pazarlık olabilir. Gerçek niyetini saklayabilirsin. Yalnızca mesajı yaz, tırnak veya açıklama ekleme.`;

/** Yedek konuşma: kişiliğe, canına ve geçmişe göre; art arda aynı cümleyi tekrarlamaz */
export function fallbackSpeech(obs: Observation, p?: Persona, rand?: Rand): string {
  return speech(obs, p, rand);
}

export async function speak(p: Persona, obs: Observation): Promise<string> {
  if (!client) return fallbackSpeech(obs, p);
  const prompt = `Adın: ${p.name}\nKişiliğin: ${p.persona}\nStratejin: ${p.strategy}${memoryBlock(obs)}\n\nTur: ${obs.round}\nCanın: ${obs.myHp}\nRakipler: ${JSON.stringify(obs.opponents)}\nGeçmiş:\n${obs.history.slice(-8).join("\n") || "(yok)"}`;
  try {
    const res = await client.messages.create({
      model: process.env.AGENT_MODEL ?? "claude-haiku-5-5",
      max_tokens: 120,
      system: TALK,
      messages: [{ role: "user", content: prompt }],
    });
    const text = res.content.map((c) => (c.type === "text" ? c.text : "")).join("").trim().replace(/^["“]|["”]$/g, "");
    return text ? text.slice(0, 130) : fallbackSpeech(obs, p);
  } catch {
    return fallbackSpeech(obs, p);
  }
}
