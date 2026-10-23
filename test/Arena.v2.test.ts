import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const DEFEND = 0, ATTACK = 1, ALLY = 2, STEAL = 3, CHARGE = 4, PACT = 5;
const ADVANCED = 1, EVENTS = 2;
type MoveSpec = [action: number, target: number];

const coder = ethers.AbiCoder.defaultAbiCoder();
const saltOf = (slot: number) => ethers.zeroPadValue(ethers.toBeHex(slot + 1), 32);
const hashOf = (matchId: number, round: number, slot: number, [a, t]: MoveSpec) =>
  ethers.keccak256(
    coder.encode(["uint256", "uint8", "uint8", "uint8", "uint8", "bytes32"], [matchId, round, slot, a, t, saltOf(slot)]),
  );

/** Yeni hamleler (Steal, Charge, Pact), arena olayları ve ajan istatistikleri */
describe("Arena v2", () => {
  async function setup(opts: { agents?: number; flags?: number; maxRounds?: number } = {}) {
    const { agents = 3, flags = ADVANCED, maxRounds = 12 } = opts;
    const signers = await ethers.getSigners();
    const [deployer, alice] = signers;
    const ops = signers.slice(5, 5 + agents);
    const arena = await ethers.deployContract("Arena");
    for (let i = 0; i < agents; i++) await arena.registerAgent(ops[i].address, `Ajan${i}`, "kişilik", "strateji");
    const ids = Array.from({ length: agents }, (_, i) => i + 1);
    await arena.createMatchWithFlags(ids, 60, 30, maxRounds, flags);

    const commit = (round: number, slot: number, mv: MoveSpec, matchId = 1) =>
      arena.connect(ops[slot]).commitMove(matchId, slot, hashOf(matchId, round, slot, mv));
    const reveal = (slot: number, mv: MoveSpec, matchId = 1) =>
      arena.connect(ops[slot]).revealMove(matchId, slot, mv[0], mv[1], saltOf(slot));
    /** null: bu tur hamle vermez. Ağır saldırı hazırlayan slot zaten hamle vermez; diğer pasif canlılar için süre geçirilir. */
    const playRound = async (round: number, moves: (MoveSpec | null)[], matchId = 1) => {
      const hp = await arena.getHp(matchId);
      let passive = false;
      for (let s = 0; s < moves.length; s++) {
        if (moves[s] || hp[s] === 0n) continue;
        if ((await arena.getCharge(matchId, s)) === 0n) passive = true;
      }
      for (let s = 0; s < moves.length; s++) if (moves[s]) await commit(round, s, moves[s]!, matchId);
      if (passive) await time.increase(31);
      for (let s = 0; s < moves.length; s++) if (moves[s]) await reveal(s, moves[s]!, matchId);
      if (passive) await time.increase(31);
      await arena.resolveRound(matchId);
    };
    const start = async (matchId = 1) => {
      await time.increase(61);
      await arena.startMatch(matchId);
    };
    return { arena, deployer, alice, ops, commit, reveal, playRound, start, ids };
  }

  describe("bayraklar", () => {
    it("createMatch bayraksızdır; createMatchWithFlags bayrağı saklar, geçersizini reddeder", async () => {
      const { arena } = await setup({ flags: ADVANCED | EVENTS });
      expect(await arena.matchFlags(1)).to.equal(3);
      await arena.createMatch([1, 2], 60, 30, 5);
      expect(await arena.matchFlags(2)).to.equal(0);
      await expect(arena.createMatchWithFlags([1, 2], 60, 30, 5, 4)).to.be.revertedWithCustomError(arena, "BadInput");
    });

    it("klasik maçta Steal, Charge ve Pact açılamaz", async () => {
      const { arena, commit, reveal, start } = await setup({ flags: 0 });
      await start();
      await commit(0, 0, [STEAL, 1]);
      await commit(0, 1, [CHARGE, 0]);
      await commit(0, 2, [PACT, 2]);
      await expect(reveal(0, [STEAL, 1])).to.be.revertedWithCustomError(arena, "BadInput");
      await expect(reveal(1, [CHARGE, 0])).to.be.revertedWithCustomError(arena, "BadInput");
      await expect(reveal(2, [PACT, 2])).to.be.revertedWithCustomError(arena, "BadInput");
    });

    it("olmayan hamle numarası reddedilir", async () => {
      const { arena, ops, start } = await setup();
      await start();
      await arena.connect(ops[0]).commitMove(1, 0, hashOf(1, 0, 0, [6, 1]));
      await expect(arena.connect(ops[0]).revealMove(1, 0, 6, 1, saltOf(0))).to.be.reverted;
    });
  });

  describe("Steal (çalma)", () => {
    it("savunmasız hedeften 1 can çalar; savunan hedef etkilenmez", async () => {
      const { arena, playRound, start } = await setup({ maxRounds: 20 });
      await start();
      await playRound(0, [[ATTACK, 2], [DEFEND, 1], [DEFEND, 2]]); // savunan slot 2 bloklar, kimse hasar almaz
      await playRound(1, [[ATTACK, 1], [ATTACK, 0], [ATTACK, 0]]); // slot 0: 10 -> 6 (iki saldırı), slot 1: 10 -> 8
      expect(await arena.getHp(1)).to.deep.equal([6n, 8n, 10n]);
      // slot 0, slot 1'den çalar (slot 1 savunmuyor): 0 +1, 1 -1
      await playRound(2, [[STEAL, 1], [ATTACK, 2], [DEFEND, 2]]);
      expect(await arena.getHp(1)).to.deep.equal([7n, 7n, 10n]);
      // savunana karşı boşa gider
      await playRound(3, [[STEAL, 1], [DEFEND, 1], [DEFEND, 2]]);
      expect(await arena.getHp(1)).to.deep.equal([7n, 7n, 10n]);
    });

    it("tam canlı hırsız 10'u aşmaz", async () => {
      const { arena, playRound, start } = await setup();
      await start();
      await playRound(0, [[STEAL, 1], [DEFEND, 1], [DEFEND, 2]]); // blok
      await playRound(1, [[STEAL, 2], [DEFEND, 1], [ATTACK, 1]]); // slot 2 savunmuyor: -1, hırsız 10 kalır
      const hp = await arena.getHp(1);
      expect(hp[0]).to.equal(10n);
      expect(hp[2]).to.equal(9n);
    });
  });

  describe("Charge (ağır saldırı)", () => {
    it("bir tur hazırlanır, sonraki tur kendiliğinden 4 hasar vurur ve hamle istemez", async () => {
      const { arena, commit, playRound, start } = await setup();
      await start();
      await playRound(0, [[CHARGE, 1], [DEFEND, 1], [DEFEND, 2]]);
      expect(await arena.getCharge(1, 0)).to.equal(2n); // hedef slot 1 -> 1+1
      expect(await arena.allCommitted(1)).to.equal(false);
      await expect(commit(1, 0, [ATTACK, 1])).to.be.revertedWithCustomError(arena, "BadInput"); // şarjlı slot hamle veremez
      // slot 1 savunmuyor: ağır saldırı tam 4 hasar
      await playRound(1, [null, [ALLY, 2], [DEFEND, 2]]);
      expect((await arena.getHp(1))[1]).to.equal(6n);
      expect(await arena.getCharge(1, 0)).to.equal(0n); // harcandı
    });

    it("savunan hedefi yalnızca 1 hasarla deler", async () => {
      const { arena, playRound, start } = await setup();
      await start();
      await playRound(0, [[CHARGE, 1], [DEFEND, 1], [DEFEND, 2]]);
      await playRound(1, [null, [DEFEND, 1], [DEFEND, 2]]);
      expect((await arena.getHp(1))[1]).to.equal(9n);
    });

    it("ittifak teklif eden hedefe ihanet gibi vurur (6 hasar)", async () => {
      const { arena, playRound, start } = await setup();
      await start();
      await playRound(0, [[CHARGE, 1], [DEFEND, 1], [DEFEND, 2]]);
      await playRound(1, [null, [ALLY, 0], [DEFEND, 2]]);
      expect((await arena.getHp(1))[1]).to.equal(4n);
    });

    it("hazırlık turunda savunmasızdır; şarjlı ajan o tur savunamaz", async () => {
      const { arena, playRound, start } = await setup();
      await start();
      await playRound(0, [[CHARGE, 1], [ATTACK, 0], [DEFEND, 2]]);
      expect((await arena.getHp(1))[0]).to.equal(8n);
    });

    it("şarj eden ajan ağır saldırı turunda tur çözümü için beklenmez", async () => {
      const { arena, commit, reveal, start } = await setup({ agents: 2 });
      await start();
      await commit(0, 0, [CHARGE, 1]);
      await commit(0, 1, [DEFEND, 1]);
      await reveal(0, [CHARGE, 1]);
      await reveal(1, [DEFEND, 1]);
      await arena.resolveRound(1);
      // yeni turda yalnızca slot 1'in hamlesi gerekir
      await commit(1, 1, [DEFEND, 1]);
      expect(await arena.allCommitted(1)).to.equal(true);
      await reveal(1, [DEFEND, 1]);
      await arena.resolveRound(1); // süre beklemeden çözülür
      expect((await arena.getHp(1))[1]).to.equal(9n);
    });

    it("hedef ölürse hazırlanan saldırı boşa gider", async () => {
      const { arena, playRound, start } = await setup({ agents: 3, maxRounds: 20 });
      await start();
      await playRound(0, [[CHARGE, 2], [ATTACK, 2], [ATTACK, 1]]);
      // slot 2'yi öldür
      for (let r = 1; r < 8 && (await arena.getHp(1))[2] > 0n; r++) await playRound(r, [null, [ATTACK, 2], null]);
      expect((await arena.getHp(1))[2]).to.equal(0n);
      expect(await arena.getCharge(1, 0)).to.equal(0n); // ağır saldırı bir tur içinde harcandı
    });
  });

  describe("Pact (toplu ittifak)", () => {
    it("3 ve üzeri oyuncu pakt yaparsa herkes +1 can kazanır", async () => {
      const { arena, playRound, start } = await setup({ maxRounds: 20 });
      await start();
      await playRound(0, [[ATTACK, 1], [ATTACK, 0], [ATTACK, 0]]); // hasar al
      const before = await arena.getHp(1);
      await playRound(1, [[PACT, 0], [PACT, 1], [PACT, 2]]);
      const after = await arena.getHp(1);
      for (let i = 0; i < 3; i++) expect(after[i]).to.equal(before[i] + 1n > 10n ? 10n : before[i] + 1n);
      expect(before).to.deep.equal([6n, 8n, 10n]); // 1. turdan sonra can farkı gerçekten var
    });

    it("geçerli bir pakt üyesine saldırmak ihanettir (4 hasar); pakt iyileşmesi hasardan sonra eklenir", async () => {
      const { arena, playRound, start } = await setup({ agents: 4, maxRounds: 20 });
      await start();
      await playRound(0, [[PACT, 0], [PACT, 1], [PACT, 2], [ATTACK, 0]]);
      const hp = await arena.getHp(1);
      expect(hp[0]).to.equal(7n); // 10 - 4 (ihanet) + 1 (pakt)
      expect(hp[1]).to.equal(10n); // 10 + 1, 10 ile sınırlı
      expect((await arena.getStats(4)).betrayals).to.equal(1);
    });

    it("2 oyuncudan az pakt kurulamaz: pakt savunma sayılır, saldırı bloklanır", async () => {
      const { arena, playRound, start } = await setup();
      await start();
      await playRound(0, [[PACT, 0], [ATTACK, 0], [DEFEND, 2]]);
      expect(await arena.getHp(1)).to.deep.equal([10n, 10n, 10n]);
    });
  });

  describe("arena olayları (FLAG_EVENTS)", () => {
    it("olay bayrağı olmayan maçta olay çıkmaz", async () => {
      const { arena, playRound, start } = await setup({ flags: ADVANCED, maxRounds: 30 });
      await start();
      for (let r = 0; r < 20; r++) await playRound(r, [[ALLY, 1], [ALLY, 2], [ALLY, 0]]);
      expect(await arena.queryFilter(arena.filters.ArenaEvent())).to.have.length(0);
    });

    it("olaylar geçerli türde ve slottadır, tuzak öldürmez, savunan etkilenmez, can sınırları korunur", async () => {
      const { arena, playRound, start } = await setup({ flags: EVENTS, maxRounds: 40 });
      await start();
      let r = 0;
      for (; r < 40; r++) {
        if ((await arena.getMatch(1)).phase === 3n) break;
        await playRound(r, [[ALLY, 1], [ALLY, 2], [ALLY, 0]]); // hiç kimse savunmuyor, tuzak etkili; karşılıksız ittifaklar hasar vermez
      }
      const events = await arena.queryFilter(arena.filters.ArenaEvent());
      expect(events.length).to.be.greaterThan(0);
      for (const e of events) {
        expect([1n, 2n]).to.include(e.args.kind);
        expect(e.args.slot).to.be.lessThan(3n);
      }
      // okuma fonksiyonu olayla aynı bilgiyi verir
      for (const e of events) {
        const [kind, slot] = await arena.getArenaEvent(1, Number(e.args.round));
        expect(kind).to.equal(e.args.kind);
        expect(slot).to.equal(e.args.slot);
      }
      expect((await arena.getArenaEvent(1, 39))[0]).to.be.oneOf([0n, 1n, 2n]);
      const hp = await arena.getHp(1);
      for (const h of hp) expect(h).to.be.within(0n, 10n);
    });

    it("hamle yapan herkes savunuyorsa tuzak hiç etki etmez", async () => {
      const { arena, playRound, start } = await setup({ flags: EVENTS, maxRounds: 30 });
      await start();
      for (let r = 0; r < 30; r++) await playRound(r, [[DEFEND, 0], [DEFEND, 1], [DEFEND, 2]]);
      const traps = (await arena.queryFilter(arena.filters.ArenaEvent())).filter((e) => e.args.kind === 1n);
      expect(traps).to.have.length(0);
    });
  });

  describe("ajan istatistikleri", () => {
    it("saldırı, ihanet, ittifak ve hasar sayılır", async () => {
      const { arena, playRound, start } = await setup({ maxRounds: 20 });
      await start();
      // slot 1 slot 0'a ittifak teklif eder, slot 0 saldırır -> ihanet 4 hasar
      await playRound(0, [[ATTACK, 1], [ALLY, 0], [DEFEND, 2]]);
      const s0 = await arena.getStats(1);
      const s1 = await arena.getStats(2);
      expect(s0.attacks).to.equal(1);
      expect(s0.betrayals).to.equal(1);
      expect(s0.damageDealt).to.equal(4);
      expect(s1.betrayed).to.equal(1);
      expect(s1.damageTaken).to.equal(4);
      // karşılıklı ittifak
      await playRound(1, [[ALLY, 1], [ALLY, 0], [DEFEND, 2]]);
      expect((await arena.getStats(1)).alliances).to.equal(1);
      expect((await arena.getStats(2)).alliances).to.equal(1);
    });

    it("Steal ve Pact sayaçları artar", async () => {
      const { arena, playRound, start } = await setup({ maxRounds: 20 });
      await start();
      await playRound(0, [[STEAL, 1], [ATTACK, 2], [DEFEND, 2]]);
      expect((await arena.getStats(1)).steals).to.equal(1);
      await playRound(1, [[PACT, 0], [PACT, 1], [PACT, 2]]);
      for (const id of [1, 2, 3]) expect((await arena.getStats(id)).pacts).to.equal(1);
    });

    it("galibiyet serisi maçlar arası artar, kaybedince sıfırlanır", async () => {
      const { arena, ops, playRound, start } = await setup({ agents: 2, maxRounds: 1 });
      // Maç 1: slot 0 kazanır (1 tur, slot 1'e saldırır)
      await start();
      await playRound(0, [[ATTACK, 1], [DEFEND, 1]].map((m, i) => (i === 0 ? ([ATTACK, 1] as MoveSpec) : ([ALLY, 0] as MoveSpec))));
      expect((await arena.getStats(1)).streak).to.equal(1);
      expect((await arena.getStats(2)).streak).to.equal(0);
      // Maç 2 ve 3: slot 0 yine kazanır
      for (const matchId of [2, 3]) {
        await arena.createMatchWithFlags([1, 2], 60, 30, 1, ADVANCED);
        await time.increase(61);
        await arena.startMatch(matchId);
        await arena.connect(ops[0]).commitMove(matchId, 0, hashOf(matchId, 0, 0, [ATTACK, 1]));
        await arena.connect(ops[1]).commitMove(matchId, 1, hashOf(matchId, 0, 1, [ALLY, 0]));
        await arena.connect(ops[0]).revealMove(matchId, 0, ATTACK, 1, saltOf(0));
        await arena.connect(ops[1]).revealMove(matchId, 1, ALLY, 0, saltOf(1));
        await arena.resolveRound(matchId);
      }
      expect((await arena.getStats(1)).streak).to.equal(3);
      expect((await arena.getStats(1)).bestStreak).to.equal(3);
      // Maç 4: slot 1 kazanır, seri sıfırlanır ama en iyi seri korunur
      await arena.createMatchWithFlags([1, 2], 60, 30, 1, ADVANCED);
      await time.increase(61);
      await arena.startMatch(4);
      await arena.connect(ops[0]).commitMove(4, 0, hashOf(4, 0, 0, [ALLY, 1]));
      await arena.connect(ops[1]).commitMove(4, 1, hashOf(4, 0, 1, [ATTACK, 0]));
      await arena.connect(ops[0]).revealMove(4, 0, ALLY, 1, saltOf(0));
      await arena.connect(ops[1]).revealMove(4, 1, ATTACK, 0, saltOf(1));
      await arena.resolveRound(4);
      expect((await arena.getStats(1)).streak).to.equal(0);
      expect((await arena.getStats(1)).bestStreak).to.equal(3);
      expect((await arena.getStats(2)).streak).to.equal(1);
    });
  });
});
