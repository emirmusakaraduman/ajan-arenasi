import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzeMatch, MemoryStore, type Mv } from "./memory.js";

const mv = (action: number, target: number): Mv => ({ action, target, submitted: true });
const none: Mv = { action: 0, target: 0, submitted: false };

test("ittifak teklif edene saldırmak ihanet olarak kaydedilir", () => {
  const names = ["Kurt", "Tilki", "Kale"];
  // Tilki Kurt'a ittifak teklif eder, Kurt saldırır; Kale savunur
  const lessons = analyzeMatch(names, [[mv(1, 1), mv(2, 0), mv(0, 2)]], 0, [10, 6, 10], 7);
  assert.match(lessons[1].join(" "), /Kurt sana 1 kez ihanet etti/);
  assert.match(lessons[0].join(" "), /Tilki ajanına 1 kez ihanet ettin/);
  assert.match(lessons[0][0], /kazandın/);
  assert.match(lessons[1][0], /kaybettin, kazanan Kurt/);
});

test("savunan hedefe saldırı ihanet sayılmaz", () => {
  const lessons = analyzeMatch(["A", "B"], [[mv(1, 1), mv(0, 1)]], 0, [10, 10], 1);
  assert.ok(!lessons[1].some((l) => l.includes("ihanet")));
});

test("karşılıklı ittifak ve çalma sayılır", () => {
  const lessons = analyzeMatch(
    ["A", "B", "C"],
    [[mv(2, 1), mv(2, 0), mv(3, 0)], [mv(2, 1), mv(2, 0), none]],
    0,
    [10, 10, 10],
    2,
  );
  assert.match(lessons[0].join(" "), /B ile 2 tur karşılıklı ittifak/);
  assert.match(lessons[0].join(" "), /C senden 1 kez can çaldı/);
});

test("ağır saldırı savunmayı delip ittifak teklif edene ihanet sayılır", () => {
  // tur 0: A güç toplar (hedef B), B ittifak teklif eder; tur 1: A otomatik vurur, B hâlâ A'ya ittifak teklif eder
  const lessons = analyzeMatch(["A", "B"], [[mv(4, 1), mv(2, 0)], [none, mv(2, 0)]], 0, [10, 4], 3);
  assert.match(lessons[1].join(" "), /A sana 1 kez ihanet etti/);
});

test("pakt üyesine saldırmak ihanettir, yetersiz pakt savunmadır", () => {
  const on = analyzeMatch(["A", "B", "C", "D"], [[mv(5, 0), mv(5, 1), mv(5, 2), mv(1, 0)]], 3, [6, 10, 10, 10], 4);
  assert.match(on[0].join(" "), /D sana 1 kez ihanet etti/);
  const off = analyzeMatch(["A", "B", "C"], [[mv(5, 0), mv(5, 1), mv(1, 0)]], 2, [10, 10, 10], 5);
  assert.ok(!off[0].some((l) => l.includes("ihanet")));
});

test("hafıza kalıcıdır, son dersler sınırlıdır, aynı maç iki kez yazılmaz", () => {
  const dir = mkdtempSync(join(tmpdir(), "arena-mem-"));
  try {
    const file = join(dir, "memory.json");
    const m = new MemoryStore(file);
    for (let i = 1; i <= 20; i++) m.record(i, 5, [`ders ${i}`], i % 2 === 0);
    m.finish(20);
    const again = new MemoryStore(file);
    assert.ok(again.has(20));
    assert.ok(!again.has(21));
    const lines = again.lines(5);
    assert.match(lines[0], /10 galibiyet, 10 mağlubiyet/);
    assert.equal(lines.length, 1 + 6); // başlık + son 6 ders
    assert.equal(lines[lines.length - 1], "ders 20");
    assert.deepEqual(again.lines(99), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("bozuk hafıza dosyası süreci düşürmez", async () => {
  const dir = mkdtempSync(join(tmpdir(), "arena-mem-"));
  try {
    const { writeFileSync } = await import("node:fs");
    const file = join(dir, "memory.json");
    writeFileSync(file, "{bozuk");
    const m = new MemoryStore(file);
    assert.deepEqual(m.lines(1), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
