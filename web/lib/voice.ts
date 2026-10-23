/**
 * Spiker sesi: tarayıcının kurulu seslerinden en doğal Türkçe olanı seçer ve cümleyi spor spikeri gibi okur:
 * heyecanlı cümleler (!) hızlı ve tizdir, sakin cümleler yavaş ve kalındır, her cümle arasında kısa nefes payı bırakılır.
 */
let cached: SpeechSynthesisVoice | null | undefined;

/** Ses kalitesi puanı: "Natural/Online/Neural" sesler (Edge, Windows 11, Chrome) ve Apple'ın gelişmiş sesleri öne geçer */
function score(v: SpeechSynthesisVoice): number {
  const n = `${v.name} ${v.voiceURI}`.toLowerCase();
  let s = 0;
  if (/natural|neural|online/.test(n)) s += 100;
  if (/premium|enhanced|gelişmiş/.test(n)) s += 60;
  if (/google/.test(n)) s += 30;
  if (/emel|ahmet|filiz|yelda|cem|tolga/.test(n)) s += 20;
  if (v.localService === false) s += 10; // bulut sesleri genelde daha doğal
  if (/espeak|compact/.test(n)) s -= 80;
  return s;
}

function pickVoice(): SpeechSynthesisVoice | null {
  if (cached !== undefined && cached !== null) return cached;
  const all = window.speechSynthesis.getVoices();
  const tr = all.filter((v) => /^tr([-_]|$)/i.test(v.lang));
  cached = tr.sort((a, b) => score(b) - score(a))[0] ?? null;
  return cached;
}

if (typeof window !== "undefined" && window.speechSynthesis) {
  window.speechSynthesis.addEventListener?.("voiceschanged", () => { cached = undefined; });
}

const jitter = (base: number, amount: number) => base + (Math.random() - 0.5) * 2 * amount;

/** Cümleleri ayırıp her birini duygusuna göre okur. Önceki konuşma kesilir. */
export function announce(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const voice = pickVoice();
  const parts = text.match(/[^.!?…]+[.!?…]*/g)?.map((p) => p.trim()).filter(Boolean) ?? [text];
  parts.forEach((part, i) => {
    const hype = /!/.test(part);
    const question = /\?/.test(part);
    const u = new SpeechSynthesisUtterance(part);
    u.lang = "tr-TR";
    if (voice) u.voice = voice;
    u.rate = jitter(hype ? 1.1 : 0.98, 0.03);
    u.pitch = jitter(hype ? 1.12 : question ? 1.05 : 0.95, 0.04);
    u.volume = hype ? 1 : 0.9;
    // kısa nefes payı: ilk cümleden sonra her cümle bir önceki bitince başlar (tarayıcı sıraya dizer)
    if (i > 0) u.rate *= 0.99;
    synth.speak(u);
  });
}

export function stopAnnouncing() {
  if (typeof window !== "undefined") window.speechSynthesis?.cancel();
}
