import { test } from "node:test";
import assert from "node:assert/strict";
import { fallback, fallbackSpeech, validate, type Observation, type Persona } from "./brain.js";
import { resetSpeechMemory, speech, traits } from "./instinct.js";
import { analyze, emptyFacts, MemoryStore, type Mv } from "./memory.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Tekrarlanabilir rastgelelik (mulberry32) */
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const GLADIATOR: Persona = { name: "Gladyatör", persona: "gururlu, sabırsız, geri adım atmaz", strategy: "Her turda en zayıf rakibe saldır, savunmaya asla geçme." };
const FORTRESS: Persona = { name: "Kale", persona: "temkinli ve sakin", strategy: "Çoğunlukla savun, can kazandıran ittifaklara gir." };
const SNAKE: Persona = { name: "Yılan", persona: "sinsi ve kurnaz", strategy: "İttifak kur, güven kazan, tam doğru anda ihanet et." };
const DIPLOMAT: Persona = { name: "Diplomat", persona: "tatlı dilli, herkesle arası iyi", strategy: "Herkese ittifak teklif et, sana saldıranı asla unutma." };

const obsFor = (p: Persona, extra: Partial<Observation> = {}): Observation => ({
  round: 0, mySlot: 0, myHp: 10,
  opponents: [{ slot: 1, name: "Rakip1", hp: 10 }, { slot: 2, name: "Rakip2", hp: 7 }],
  history: [], messages: [], myName: p.name, ...extra,
});

const share = (n: number, f: (i: number) => boolean) => Array.from({ length: n }, (_, i) => f(i)).filter(Boolean).length / n;

test("kişilik anahtar kelimelerden eğilim çıkarır", () => {
  assert.ok(traits(`${GLADIATOR.persona} ${GLADIATOR.strategy}`).aggr >= 2);
  assert.ok(traits(`${FORTRESS.persona} ${FORTRESS.strategy}`).defn >= 2);
  assert.ok(traits(`${SNAKE.persona} ${SNAKE.strategy}`).treach >= 2);
  assert.ok(traits(`${DIPLOMAT.persona} ${DIPLOMAT.strategy}`).dipl >= 2);
});

test("olumsuzlama eğilimi tersine çevirmez: \"savunmaya asla geçme\" savunmacılık sayılmaz", () => {
  const g = traits(`${GLADIATOR.persona} ${GLADIATOR.strategy}`);
  assert.equal(g.defn, 0);
  assert.ok(g.aggr >= 2);
  assert.equal(traits("kimseye güvenme, asla ittifak kurma").dipl, 0);
  // olumlu cümle etkilenmez
  assert.ok(traits("Çoğunlukla savun, ittifaklara gir.").defn >= 1);
});

test("Kale çok savunur, Gladyatör çok saldırır", () => {
  const rand = seeded(1);
  const N = 1500;
  const kale = share(N, () => fallback(obsFor(FORTRESS), FORTRESS, rand).action === 0);
  const kaleAttack = share(N, () => fallback(obsFor(FORTRESS), FORTRESS, rand).action === 1);
  const glad = share(N, () => fallback(obsFor(GLADIATOR), GLADIATOR, rand).action === 1);
  const gladDefend = share(N, () => fallback(obsFor(GLADIATOR), GLADIATOR, rand).action === 0);
  assert.ok(kale > 0.35, `Kale savunma payı ${kale}`);
  assert.ok(glad > 0.35, `Gladyatör saldırı payı ${glad}`);
  assert.ok(kale > gladDefend + 0.1, `Kale (${kale}) Gladyatör'den (${gladDefend}) belirgin çok savunmalı`);
  assert.ok(glad > kaleAttack + 0.1, `Gladyatör (${glad}) Kale'den (${kaleAttack}) belirgin çok saldırmalı`);
});

test("Yılan güven kazanınca ittifak teklif edene saldırır; Diplomat karşılık verir", () => {
  const history = ["Tur 1: Rakip1 ittifak teklif etti (hedef 0)"]; // önceki turda Rakip1 bana teklif etti
  const rand = seeded(2);
  const N = 800;
  const snake = share(N, () => {
    const d = fallback(obsFor(SNAKE, { round: 1, history }), SNAKE, rand);
    return d.action === 1 && d.target === 1;
  });
  const diplo = share(N, () => {
    const d = fallback(obsFor(DIPLOMAT, { round: 1, history }), DIPLOMAT, rand);
    return d.action === 2 && d.target === 1;
  });
  assert.ok(snake > 0.5, `Yılan ihanet payı ${snake}`);
  assert.ok(diplo > 0.55, `Diplomat karşılık payı ${diplo}`);
});

test("hafızadaki ihanetçiye ittifak teklif edilmez", () => {
  const facts = { ...emptyFacts(), grudges: { Rakip1: 2 } };
  const rand = seeded(3);
  for (let i = 0; i < 600; i++) {
    const d = fallback(obsFor(DIPLOMAT, { facts, round: 1 }), DIPLOMAT, rand);
    if (d.action === 2) assert.equal(d.target, 2, "ihanetçi Rakip1 ittifak hedefi olmamalı");
  }
});

test("bana saldıran karşılık görür (saldırgan karakter)", () => {
  const history = ["Tur 1: Rakip2 saldırdı (hedef 0)"];
  const rand = seeded(4);
  const N = 800;
  const retaliate = share(N, () => {
    const d = fallback(obsFor(GLADIATOR, { round: 1, history }), GLADIATOR, rand);
    return d.action === 1 && d.target === 2;
  });
  assert.ok(retaliate > 0.5, `intikam payı ${retaliate}`);
});

test("klasik maçta yalnızca 0-2, gelişmişte 3-5 de seçilir; ölü ve can kuralları korunur", () => {
  const rand = seeded(5);
  for (let i = 0; i < 1500; i++) {
    const d = fallback(obsFor(SNAKE), SNAKE, rand);
    assert.ok(d.action <= 2);
    assert.ok(validate(obsFor(SNAKE), d.action, d.target));
  }
  const adv = obsFor(GLADIATOR, { advanced: true });
  const seen = new Set<number>();
  for (let i = 0; i < 3000; i++) {
    const d = fallback(adv, GLADIATOR, rand);
    seen.add(d.action);
    assert.ok(validate(adv, d.action, d.target), `geçersiz hamle ${JSON.stringify(d)}`);
  }
  for (const a of [0, 1, 2, 3, 4, 5]) assert.ok(seen.has(a), `gelişmiş maçta ${a} hiç seçilmedi`);
  // canı çok az ajan ağır saldırı hazırlamaz; tek rakip kalınca pakt seçilmez
  const weak = obsFor(GLADIATOR, { advanced: true, myHp: 2 });
  for (let i = 0; i < 1500; i++) assert.notEqual(fallback(weak, GLADIATOR, rand).action, 4);
  const duel = obsFor(DIPLOMAT, { advanced: true, opponents: [{ slot: 1, name: "Rakip1", hp: 10 }] });
  for (let i = 0; i < 1500; i++) assert.notEqual(fallback(duel, DIPLOMAT, rand).action, 5);
});

test("ölü rakip hedef seçilmez, kimse yoksa savunur", () => {
  const rand = seeded(6);
  const obs = obsFor(GLADIATOR, { opponents: [{ slot: 1, name: "Rakip1", hp: 0 }, { slot: 2, name: "Rakip2", hp: 5 }] });
  for (let i = 0; i < 500; i++) {
    const d = fallback(obs, GLADIATOR, rand);
    if (d.action === 1 || d.action === 2) assert.equal(d.target, 2);
  }
  const alone = obsFor(GLADIATOR, { opponents: [{ slot: 1, name: "Rakip1", hp: 0 }] });
  assert.equal(fallback(alone, GLADIATOR, rand).action, 0);
  assert.equal(fallbackSpeech(alone, GLADIATOR, rand), "");
});

test("konuşma art arda tekrar etmez, kısa kalır ve kişiliğe göre ayrışır", () => {
  resetSpeechMemory();
  const rand = seeded(7);
  const said: string[] = [];
  for (let i = 0; i < 40; i++) {
    const line = speech(obsFor(SNAKE, { round: i }), SNAKE, rand);
    assert.ok(line.length > 0 && line.length <= 130);
    if (said.length) assert.notEqual(line, said[said.length - 1], "art arda aynı cümle");
    said.push(line);
  }
  assert.ok(new Set(said).size >= 12, `çeşitlilik düşük: ${new Set(said).size}`);

  resetSpeechMemory();
  const gladLines = new Set(Array.from({ length: 40 }, (_, i) => speech(obsFor(GLADIATOR, { round: i }), GLADIATOR, rand)));
  const snakeLines = new Set(said);
  const overlap = [...gladLines].filter((l) => snakeLines.has(l)).length;
  assert.ok(overlap <= 4, `Gladyatör ve Yılan çok aynı cümleyi kullanıyor: ${overlap}`);
});

test("yaralı ajan yaralı gibi konuşur, intikamcı saldırana seslenir", () => {
  resetSpeechMemory();
  const rand = seeded(8);
  const wounded = new Set(Array.from({ length: 30 }, () => speech(obsFor(FORTRESS, { myHp: 2 }), FORTRESS, rand)));
  assert.ok([...wounded].some((l) => /yaralı|azaldı|gücüm|nefes/i.test(l)));
  resetSpeechMemory();
  const revenge = new Set(Array.from({ length: 30 }, () => speech(obsFor(GLADIATOR, { round: 1, history: ["Tur 1: Rakip2 saldırdı (hedef 0)"] }), GLADIATOR, rand)));
  assert.ok([...revenge].some((l) => l.includes("Rakip2")));
});

test("maç sonu olguları: ihanet, dostluk ve hırsızlık adla birikir", () => {
  const mv = (action: number, target: number): Mv => ({ action, target, submitted: true });
  const { facts } = analyze(["A", "B", "C"], [[mv(1, 1), mv(2, 0), mv(3, 0)], [mv(2, 2), mv(0, 1), mv(2, 0)]], 0, [10, 6, 9], 1);
  assert.equal(facts[1].grudges.A, 1); // A, ittifak teklif eden B'ye saldırdı
  assert.equal(facts[2].friends.A, 1); // A ile C karşılıklı ittifak kurdu
  assert.equal(facts[0].friends.C, 1);
  assert.equal(facts[0].thieves.C, 1); // C, savunmayan A'dan can çaldı

  const dir = mkdtempSync(join(tmpdir(), "arena-facts-"));
  try {
    const file = join(dir, "m.json");
    const m = new MemoryStore(file);
    m.record(1, 7, ["x"], false, facts[1]);
    m.record(2, 7, ["y"], false, facts[1]);
    m.finish(2);
    assert.equal(new MemoryStore(file).facts(7).grudges.A, 2); // iki maçta birikti ve kalıcı
    assert.deepEqual(new MemoryStore(file).facts(99), emptyFacts());
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
