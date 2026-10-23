import type { Action, Decision, Observation, Opponent, Persona } from "./brain.js";

/**
 * Yedek beyin ("içgüdü"): LLM anahtarı olmadan oynayan ajanların karar ve konuşma mantığı.
 * Kişilik ve strateji metnindeki anahtar kelimelerden eğilim çıkarır; hafızadaki olguları (kim ihanet etti, kim dost)
 * ve son turun olaylarını (kim saldırdı, kim ittifak teklif etti) dikkate alır. Böylece Yılan, Kale ve Gladyatör
 * demoda gerçekten farklı oynar. Tüm rastgelelik enjekte edilebilir (`rand`), testler deterministik kalır.
 */
export type Rand = () => number;

/** Kişilik ve strateji metninden eğilimler: her biri eşleşen anahtar kelime sayısıdır */
export function traits(text: string) {
  const t = text.toLocaleLowerCase("tr-TR");
  // Olumsuzlama içeren cümlecikler ("savunmaya asla geçme", "kimseye güvenme") savunma ve diplomasi eğilimi sayılmaz
  const positive = t
    .split(/[.,;]/)
    .filter((c) => !/(^|\s)(asla|hiçbir zaman|hiç)(\s|$)/.test(c))
    .join(" ")
    .replace(/güven(me|mez|mem)\S*/g, " ");
  const count = (words: string[], from = t) => words.reduce((n, w) => n + (from.includes(w) ? 1 : 0), 0);
  return {
    aggr: count(["saldır", "vur", "acımasız", "agresif", "sabırsız", "öldür", "güçlü", "kavgac", "geri adım atmaz"]),
    defn: count(["savun", "bekle", "temkinli", "sakin", "korun", "kaçın", "sağ kal", "dayan"], positive),
    dipl: count(["ittifak", "güven", "anlaş", "diplomat", "dost", "tatlı", "barış", "yardım"], positive),
    treach: count(["ihanet", "kandır", "sinsi", "hile", "kurnaz", "blöf", "sırtından", "aldat", "hesapçı", "kimseye güvenmez"]),
  };
}
export type Traits = ReturnType<typeof traits>;

const VERBS: Record<string, number> = { savundu: 0, saldırdı: 1, "ittifak teklif etti": 2, çaldı: 3, "güç topladı": 4, "pakt kurdu": 5 };

/** Runner'ın tuttuğu geçmişten (`Tur N: Ad fiil (hedef slot)`) son turun olaylarını çıkarır */
export function lastRound(obs: Observation): { offeredMe: Set<number>; attackedMe: Set<number>; mine?: { action: number; target: number } } {
  const offeredMe = new Set<number>();
  const attackedMe = new Set<number>();
  let mine: { action: number; target: number } | undefined;
  const prev = obs.round; // geçmişte tur numaraları 1'den başlar: önceki tur = şimdiki tur numarası (0 tabanlı)
  const re = /^Tur (\d+): (.+) (savundu|saldırdı|ittifak teklif etti|çaldı|güç topladı|pakt kurdu) \(hedef (\d+)\)$/;
  for (const line of obs.history) {
    const m = re.exec(line);
    if (!m || Number(m[1]) !== prev) continue;
    const name = m[2], action = VERBS[m[3]], target = Number(m[4]);
    const who = obs.opponents.find((o) => o.name === name);
    if (name === obs.myName) { mine = { action, target }; continue; }
    if (!who || target !== obs.mySlot) continue;
    if (action === 2) offeredMe.add(who.slot);
    if (action === 1 || action === 3 || action === 4) attackedMe.add(who.slot);
  }
  return { offeredMe, attackedMe, mine };
}

const pickWeighted = (w: number[], rand: Rand) => {
  const total = w.reduce((a, b) => a + b, 0);
  let x = rand() * total;
  for (let i = 0; i < w.length; i++) { x -= w[i]; if (x < 0) return i; }
  return w.length - 1;
};
const sample = <T,>(arr: T[], rand: Rand) => arr[Math.min(Math.floor(rand() * arr.length), arr.length - 1)];

const REASONS: Record<Action, string[]> = {
  0: ["Bu tur beklemek en akıllıca.", "Kalkanımı kaldırıyorum.", "Önce sağ kalmak lazım.", "Acele eden kaybeder."],
  1: ["En zayıfı seçtim.", "Kılıcım hazır, kimse kaçamaz.", "Geri adım atmak yok.", "Sıra sende."],
  2: ["Güven bir silahtır.", "Birlikte daha güçlüyüz.", "Elimi uzatıyorum, tut.", "Bu ittifak ikimize de yarar."],
  3: ["Biraz canına ortak olayım.", "Cebin dolu, bende yer var.", "Çalmak da bir sanattır."],
  4: ["Güç topluyorum, hazır ol.", "Sabret, darbe geliyor.", "Bir sonraki tur seni bekliyor."],
  5: ["Hep birlikte güçlenelim.", "Hepimiz kazanabiliriz, değil mi?", "Pakt için buradayım."],
};

/** Kişilik, hafıza ve son turdan hamle seçer. `p` yoksa eğilimler nötrdür. */
export function instinct(obs: Observation, p?: Persona, rand: Rand = Math.random): Decision {
  const alive = obs.opponents.filter((o) => o.hp > 0);
  if (alive.length === 0) return { action: 0, target: obs.mySlot, reason: "Kimse kalmadı." };

  const t = traits(`${p?.persona ?? ""} ${p?.strategy ?? ""}`);
  const f = obs.facts ?? { grudges: {}, friends: {}, thieves: {} };
  const { offeredMe, attackedMe } = lastRound(obs);
  const done = (action: Action, target: number): Decision => ({ action, target: action === 0 || action === 5 ? obs.mySlot : target, reason: sample(REASONS[action], rand) });

  const weakest = alive.reduce((a, b) => (b.hp < a.hp ? b : a));
  const strongest = alive.reduce((a, b) => (b.hp > a.hp ? b : a));
  const grudge = (o: Opponent) => f.grudges[o.name] ?? 0;
  const byGrudge = [...alive].filter((o) => grudge(o) > 0).sort((a, b) => grudge(b) - grudge(a))[0];
  const attacker = alive.find((o) => attackedMe.has(o.slot));
  // güvenilir: bana son turda ittifak teklif eden ya da geçmişte dost olan, bana ihanet etmemiş rakipler
  const trusted = alive.filter((o) => (offeredMe.has(o.slot) || (f.friends[o.name] ?? 0) > 0) && grudge(o) === 0);
  const offerer = alive.find((o) => offeredMe.has(o.slot));

  // 1) İhanetçi: güven kazandıysa (geçen tur ittifak teklif eden varsa) vurur. Hedef ittifak bekliyorsa hasar 4'e çıkar.
  if (t.treach > 0 && obs.round >= 1 && trusted.length > 0 && rand() < Math.min(0.8, 0.35 + 0.15 * t.treach)) {
    const victim = trusted.find((o) => offeredMe.has(o.slot)) ?? trusted[0];
    return { action: 1, target: victim.slot, reason: sample(["Güven kazandım, şimdi vakti.", "Tam doğru an.", "Üzgünüm, iş iştir."], rand) };
  }
  // 2) İntikam: bana saldıranı unutmaz (saldırgan ve kinci karakterler daha sık)
  if (attacker && rand() < (t.aggr > 0 ? 0.65 : t.defn > 0 ? 0.25 : 0.4)) {
    return { action: 1, target: attacker.slot, reason: sample(["Geçen turu unutmadım.", "Borcunu ödeyeceksin.", "Bu sefer ben vuruyorum."], rand) };
  }
  // 3) Diplomat: ittifak teklif edene karşılık verir (ihanet etmemişse)
  if (offerer && grudge(offerer) === 0 && rand() < (t.dipl > 0 ? 0.75 : 0.35)) {
    return done(2, offerer.slot);
  }

  // 4) Eğilim ağırlıklarıyla seçim: [savun, saldır, ittifak, çal, güç topla, pakt]
  const hp = obs.myHp;
  const hasFriendCandidate = alive.some((o) => grudge(o) === 0);
  const w = [
    0.8 + 1.2 * t.defn + (hp <= 3 ? 2.5 : 0) + (attackedMe.size && t.defn > 0 ? 0.8 : 0),
    0.8 + 1.2 * t.aggr + (byGrudge ? 0.8 : 0) + (attackedMe.size ? 0.4 : 0),
    (0.4 + 1.2 * t.dipl + 0.5 * t.treach + (offeredMe.size ? 0.8 : 0)) * (hasFriendCandidate ? 1 : 0.2),
    0, 0, 0,
  ];
  if (obs.advanced) {
    w[3] = 0.3 + 0.8 * t.treach + 0.4 * t.aggr;
    w[4] = hp <= 3 ? 0 : 0.25 + 0.8 * t.aggr;
    w[5] = alive.length >= 2 ? (0.2 + 1.0 * t.dipl) * (byGrudge ? 0.4 : 1) : 0;
  }
  const action = pickWeighted(w, rand) as Action;

  if (action === 1) return done(1, byGrudge && rand() < 0.5 ? byGrudge.slot : rand() < 0.6 ? weakest.slot : sample(alive, rand).slot);
  if (action === 2) {
    const pool = (trusted.length ? trusted : alive.filter((o) => grudge(o) === 0)).concat(alive.length && !hasFriendCandidate ? alive : []);
    return done(2, sample(pool, rand).slot);
  }
  if (action === 3) return done(3, strongest.slot); // en çok canı olandan çalmak en kârlısı
  if (action === 4) return done(4, weakest.slot);
  return done(action, obs.mySlot);
}

// ---------------------------------------------------------------- konuşma

type Line = (n: string, s: string) => string; // n: hedef ajan adı, s: kendi adım

const THREAT: Line[] = [
  (n) => `${n}, seni izliyorum. Yanlış bir hamle yapma.`,
  (n) => `Herkes ${n} için hazırlansın, o çok güçlü görünüyor.`,
  (n) => `${n}, bu tur kılıcım senin için bileniyor.`,
  (n) => `${n}, kaçacak yerin yok. Boşuna yorulma.`,
  (_, s) => `${s} geri adım atmaz. Kim yolumu keserse pişman olur.`,
  (n) => `Arenanın tek kralı olacağım, ${n}. Sıra sende.`,
];
const PEACE: Line[] = [
  (n) => `${n}, ittifak teklif ediyorum. Güvenebilirsin.`,
  (n) => `${n}, bu turda birbirimize dokunmayalım. Anlaştık mı?`,
  (n) => `Birlikte daha güçlüyüz, ${n}. Elimi tut.`,
  (n) => `${n}, sana bir şey olmasını istemem. Dost kalalım.`,
  (n) => `Kimse kimseye saldırmasa hepimiz kazanırız. Ne dersin ${n}?`,
  (n) => `${n}, geçen tur için sorun yok. Yeni bir başlangıç yapalım.`,
];
const BLUFF: Line[] = [
  (n) => `${n}, sana tamamen güveniyorum. Sen de bana güven, tamam mı?`,
  (n) => `Ben sadece barış istiyorum, ${n}. Gözlerimin içine bak.`,
  (n) => `${n}, ittifak benim için kutsaldır. Kesinlikle saldırmayacağım.`,
  (n) => `Bu turu savunarak geçireceğim, ${n}. Hiç merak etme.`,
  (n) => `${n}, birlikte zirveye çıkarız. Şüphen mi var?`,
  (_, s) => `${s} sözünün eridir. Kimse bana inanmak zorunda değil ama inanın.`,
];
const CAUTIOUS: Line[] = [
  (_, s) => `${s} bu turu savunarak geçirecek. Kimse boşuna saldırmasın.`,
  (n) => `${n}, acele etme. Sabreden kazanır.`,
  () => `Kalkanım hazır. Önce kim hata yapacak, görelim.`,
  (n) => `${n}, ben kavga aramıyorum ama kendimi korurum.`,
  () => `Bekle ve gör. Bu arenada sabırlı olan ayakta kalır.`,
];
const WOUNDED: Line[] = [
  (_, s) => `${s} yaralı ama pes etmez. Yaklaşan olursa pişman eder.`,
  () => `Canım azaldı. Beni bu turda rahat bırakın, lütfen.`,
  (n) => `${n}, gücüm kalmadı ama kılıcım hâlâ keskin.`,
  () => `Son nefesime kadar savaşırım. Kim cesaret edecek?`,
];
const REVENGE: Line[] = [
  (n) => `${n}, geçen turki saldırını unutmadım.`,
  (n) => `Bir kez vurdun ${n}. İkincisine izin vermem.`,
  (n) => `${n}, bu tur hesaplaşma zamanı.`,
  (n) => `${n}, bana el kaldıran pişman olur. Hazır ol.`,
];
const GRUDGE: Line[] = [
  (n) => `${n}, bana ihanet ettin. Bir daha sana asla güvenmem.`,
  (n) => `Herkes dikkat: ${n} ittifak teklif edip vuruyor. Sakın inanmayın.`,
  (n) => `${n}, o ihaneti hatırlıyorum. Bu sefer işin zor.`,
];
const GENERIC: Line[] = [
  (n) => `${n}, seni izliyorum. Yanlış bir hamle yapma.`,
  (n) => `${n}, bu turda birbirimize dokunmayalım. Anlaştık mı?`,
  (n) => `Herkes ${n} için hazırlansın, o çok güçlü görünüyor.`,
];

/** Aynı ajanın son söylediği cümleler: art arda tekrar etmesin */
const recent = new Map<string, string[]>();
const REMEMBER = 5;

/** Kişiliğe, can durumuna ve geçmişe göre tek bir kısa mesaj üretir; son birkaç cümleyi tekrarlamaz. */
export function speech(obs: Observation, p?: Persona, rand: Rand = Math.random): string {
  const alive = obs.opponents.filter((o) => o.hp > 0);
  if (alive.length === 0) return "";
  const t = traits(`${p?.persona ?? ""} ${p?.strategy ?? ""}`);
  const f = obs.facts ?? { grudges: {}, friends: {}, thieves: {} };
  const me = obs.myName ?? p?.name ?? "Ben";
  const { attackedMe, offeredMe } = lastRound(obs);

  const grudged = alive.find((o) => (f.grudges[o.name] ?? 0) > 0);
  const attacker = alive.find((o) => attackedMe.has(o.slot));
  const friend = alive.find((o) => offeredMe.has(o.slot) || (f.friends[o.name] ?? 0) > 0) ?? sample(alive, rand);
  const weakest = alive.reduce((a, b) => (b.hp < a.hp ? b : a));
  const strongest = alive.reduce((a, b) => (b.hp > a.hp ? b : a));

  let pool: Line[];
  let who: Opponent;
  if (obs.myHp <= 3 && rand() < 0.7) { pool = WOUNDED; who = strongest; }
  else if (attacker && (t.aggr > 0 || rand() < 0.5)) { pool = REVENGE; who = attacker; }
  else if (grudged && rand() < 0.6) { pool = GRUDGE; who = grudged; }
  else {
    // baskın eğilim; ihanetçi dost gibi konuşur (blöf)
    const k = pickWeighted([t.aggr + 0.05, t.dipl + 0.05, t.treach * 1.5 + 0.05, t.defn + 0.05], rand);
    if (k === 0) { pool = THREAT; who = strongest; }
    else if (k === 1) { pool = PEACE; who = friend; }
    else if (k === 2) { pool = BLUFF; who = friend; }
    else { pool = CAUTIOUS; who = weakest; }
    if (t.aggr + t.dipl + t.treach + t.defn === 0) { pool = GENERIC; who = sample(alive, rand); }
  }

  const key = me;
  const seen = recent.get(key) ?? [];
  const lines = pool.map((l) => l(who.name, me));
  const fresh = lines.filter((l) => !seen.includes(l));
  // havuz tükendiyse başka hedefle yeniden dene, o da olmazsa en eskisini yeniden kullan
  const candidates = fresh.length ? fresh : alive.flatMap((o) => pool.map((l) => l(o.name, me))).filter((l) => !seen.includes(l));
  const out = sample(candidates.length ? candidates : lines, rand).slice(0, 130);
  recent.set(key, [...seen, out].slice(-REMEMBER));
  return out;
}

/** Testler için konuşma geçmişini sıfırlar */
export const resetSpeechMemory = () => recent.clear();
