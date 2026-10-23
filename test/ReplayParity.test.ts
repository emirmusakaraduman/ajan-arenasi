import { expect } from "chai";
import { ethers } from "hardhat";
import { replayAll, type ArenaEvent, type Move } from "../web/lib/replay";

/**
 * Parite testi: web arayüzünün kural kopyası (web/lib/replay.ts) ile Arena.sol rastgele maçlarda aynı canları üretmeli.
 * Kontrat kuralı değişip kopya güncellenmezse bu test kırılır; arayüz sessizce yanlış anlatmaz.
 */
const coder = ethers.AbiCoder.defaultAbiCoder();
const saltOf = (slot: number) => ethers.zeroPadValue(ethers.toBeHex(slot + 1), 32);
const hashOf = (matchId: number, round: number, slot: number, a: number, t: number) =>
  ethers.keccak256(coder.encode(["uint256", "uint8", "uint8", "uint8", "uint8", "bytes32"], [matchId, round, slot, a, t, saltOf(slot)]));

/** Tekrarlanabilir rastgelelik (mulberry32) */
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

describe("Replay paritesi (web ↔ kontrat)", function () {
  this.timeout(120_000);

  /** Rastgele ama geçerli hamlelerle tam bir maç oynatır; her turdan sonra zincirdeki canları kaydeder */
  async function playRandomMatch(seed: number, agents: number, flags: number, maxRounds: number) {
    const rand = seeded(seed);
    const signers = await ethers.getSigners();
    const ops = signers.slice(5, 5 + agents);
    const arena = await ethers.deployContract("Arena");
    for (let i = 0; i < agents; i++) await arena.registerAgent(ops[i].address, `Ajan${i}`, "", "");
    await arena.createMatchWithFlags(Array.from({ length: agents }, (_, i) => i + 1), 1, 30, maxRounds, flags);
    await ethers.provider.send("evm_increaseTime", [5]);
    await ethers.provider.send("evm_mine", []);
    await arena.startMatch(1);

    const chainHp: number[][] = [];
    for (let round = 0; round < maxRounds; round++) {
      if ((await arena.getMatch(1)).phase === 3n) break;
      const hp = (await arena.getHp(1)).map(Number);
      const movers: { slot: number; a: number; t: number }[] = [];
      for (let s = 0; s < agents; s++) {
        if (hp[s] === 0 || (await arena.getCharge(1, s)) !== 0n) continue; // ölü ya da ağır saldırısını indiren ajan hamle vermez
        const others = hp.map((h, i) => i).filter((i) => i !== s && hp[i] > 0);
        const pool = flags & 1 ? [0, 1, 2, 3, 4, 5] : [0, 1, 2];
        // Pakt için en az 3 ajanın aynı turda seçmesi gerekir; rastgelelikte nadir olduğundan Pakt'a yanlılık verilir
        const a = flags & 1 && rand() < 0.35 ? 5 : pool[Math.floor(rand() * pool.length)];
        const needsTarget = a === 1 || a === 2 || a === 3 || a === 4;
        movers.push({ slot: s, a, t: needsTarget ? others[Math.floor(rand() * others.length)] : s });
      }
      for (const m of movers) await arena.connect(ops[m.slot]).commitMove(1, m.slot, hashOf(1, round, m.slot, m.a, m.t));
      for (const m of movers) await arena.connect(ops[m.slot]).revealMove(1, m.slot, m.a, m.t, saltOf(m.slot));
      await arena.resolveRound(1);
      chainHp.push((await arena.getHp(1)).map(Number));
    }

    const rounds = chainHp.length;
    const moves: Move[][] = [];
    const events: ArenaEvent[] = [];
    for (let r = 0; r < rounds; r++) {
      moves.push(await Promise.all(Array.from({ length: agents }, (_, s) => arena.getMove(1, r, s).then((x) => ({ action: Number(x.action), target: Number(x.target), submitted: x.submitted })))));
      const [kind, slot] = await arena.getArenaEvent(1, r);
      events.push(kind ? { kind: Number(kind), slot: Number(slot) } : null);
    }
    return { chainHp, moves, events, agents };
  }

  const scenarios: [name: string, seeds: number[], agents: number, flags: number, rounds: number][] = [
    ["klasik kurallar, 3 ajan", [1, 2, 3, 4], 3, 0, 10],
    ["gelişmiş hamleler, 3 ajan", [11, 12, 13, 14], 3, 1, 10],
    ["gelişmiş hamleler + arena olayları, 4 ajan", [21, 22, 23, 24], 4, 3, 12],
    ["yalnızca arena olayları, 2 ajan", [31, 32], 2, 2, 12],
    ["gelişmiş hamleler + olaylar, 6 ajan (pakt için kalabalık)", [41, 42], 6, 3, 10],
  ];

  for (const [name, seeds, agents, flags, rounds] of scenarios) {
    it(`${name}: web canları zincirle birebir eşleşir`, async () => {
      for (const seed of seeds) {
        const g = await playRandomMatch(seed, agents, flags, rounds);
        const web = replayAll(g.agents, g.moves, g.events).map((l) => l.hpAfter);
        expect(web, `seed ${seed}`).to.deep.equal(g.chainHp);
      }
    });
  }

  it("rastgele maçlar yeni mekanikleri gerçekten tetikler (test kendi kapsamını doğrular)", async () => {
    const seen = new Set<string>();
    for (const seed of [11, 12, 13, 14, 21, 22, 23, 24, 41, 42]) {
      const flags = seed >= 21 ? 3 : 1;
      const g = await playRandomMatch(seed, seed >= 41 ? 6 : seed >= 21 ? 4 : 3, flags, 10);
      for (const log of replayAll(g.agents, g.moves, g.events)) for (const e of log.events) seen.add(e.heavy ? `${e.kind}*` : e.kind);
    }
    for (const k of ["steal", "charge", "pact", "attack*", "trap", "spring", "betrayal"]) expect(seen.has(k), `${k} hiç görülmedi: ${[...seen]}`).to.equal(true);
  });
});
