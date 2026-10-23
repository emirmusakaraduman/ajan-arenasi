import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const DEFEND = 0, ATTACK = 1, ALLY = 2;
type MoveSpec = [action: number, target: number];

const coder = ethers.AbiCoder.defaultAbiCoder();
const saltOf = (slot: number) => ethers.zeroPadValue(ethers.toBeHex(slot + 1), 32);
const hashOf = (matchId: number, round: number, slot: number, [a, t]: MoveSpec) =>
  ethers.keccak256(
    coder.encode(["uint256", "uint8", "uint8", "uint8", "uint8", "bytes32"], [matchId, round, slot, a, t, saltOf(slot)]),
  );

const ETH = ethers.parseEther;

/** Kenar durum ve hata yolu testleri: bahis, ödeme, komisyon, süre aşımı, erken bitiş. */
describe("Arena (kenar durumlar)", () => {
  async function setup(opts: { agents?: number; bettingSeconds?: number; roundSeconds?: number; maxRounds?: number } = {}) {
    const { agents = 3, bettingSeconds = 60, roundSeconds = 30, maxRounds = 5 } = opts;
    const signers = await ethers.getSigners();
    const [deployer, alice, bob, carol, stranger] = signers;
    const ops = signers.slice(5, 5 + agents);
    const arena = await ethers.deployContract("Arena");
    for (let i = 0; i < agents; i++) await arena.registerAgent(ops[i].address, `Ajan${i}`, "kişilik", "strateji");
    const ids = Array.from({ length: agents }, (_, i) => i + 1);
    await arena.createMatch(ids, bettingSeconds, roundSeconds, maxRounds);

    const commit = (round: number, slot: number, mv: MoveSpec) =>
      arena.connect(ops[slot]).commitMove(1, slot, hashOf(1, round, slot, mv));
    const reveal = (slot: number, mv: MoveSpec) =>
      arena.connect(ops[slot]).revealMove(1, slot, mv[0], mv[1], saltOf(slot));
    /** `moves[slot]` null ise o slot bu tur oynamaz. Canlı bir ajan oynamazsa kontrat commit ve reveal sürelerinin dolmasını bekler. */
    const playRound = async (round: number, moves: (MoveSpec | null)[]) => {
      const hp = await arena.getHp(1);
      const passiveAlive = moves.some((mv, s) => !mv && hp[s] > 0n);
      for (let s = 0; s < moves.length; s++) if (moves[s]) await commit(round, s, moves[s]!);
      if (passiveAlive) await time.increase(roundSeconds + 1); // commit süresi
      for (let s = 0; s < moves.length; s++) if (moves[s]) await reveal(s, moves[s]!);
      if (passiveAlive) await time.increase(roundSeconds + 1); // reveal süresi
      await arena.resolveRound(1);
    };
    const start = async () => {
      await time.increase(bettingSeconds + 1);
      await arena.startMatch(1);
    };
    return { arena, deployer, alice, bob, carol, stranger, ops, commit, reveal, playRound, start };
  }

  describe("maç kurma ve ajan kaydı", () => {
    it("geçersiz girdilerle maç açılamaz", async () => {
      const { arena } = await setup();
      await expect(arena.createMatch([1], 60, 30, 5)).to.be.revertedWithCustomError(arena, "BadInput"); // tek ajan
      await expect(arena.createMatch([1, 1], 60, 30, 5)).to.be.revertedWithCustomError(arena, "BadInput"); // aynı ajan iki kez
      await expect(arena.createMatch([1, 99], 60, 30, 5)).to.be.revertedWithCustomError(arena, "BadInput"); // olmayan ajan
      await expect(arena.createMatch([0, 1], 60, 30, 5)).to.be.revertedWithCustomError(arena, "BadInput"); // id 0 boş
      await expect(arena.createMatch([1, 2], 60, 0, 5)).to.be.revertedWithCustomError(arena, "BadInput"); // tur süresi 0
      await expect(arena.createMatch([1, 2], 60, 30, 0)).to.be.revertedWithCustomError(arena, "BadInput"); // tur sayısı 0
    });

    it("en fazla 6 oyuncu", async () => {
      const { arena } = await setup();
      const signers = await ethers.getSigners();
      for (let i = 3; i < 7; i++) await arena.registerAgent(signers[10 + i].address, `Ek${i}`, "", "");
      await expect(arena.createMatch([1, 2, 3, 4, 5, 6, 7], 60, 30, 5)).to.be.revertedWithCustomError(arena, "BadInput");
      await arena.createMatch([1, 2, 3, 4, 5, 6], 60, 30, 5); // tam 6 olur
      expect(await arena.matchCount()).to.equal(2);
    });

    it("ajan kaydı sınırları", async () => {
      const { arena, alice } = await setup();
      await expect(arena.registerAgent(ethers.ZeroAddress, "x", "", "")).to.be.revertedWithCustomError(arena, "BadInput");
      await expect(arena.registerAgent(alice.address, "", "", "")).to.be.revertedWithCustomError(arena, "BadInput");
      await expect(arena.registerAgent(alice.address, "x".repeat(33), "", "")).to.be.revertedWithCustomError(arena, "BadInput");
      await expect(arena.registerAgent(alice.address, "x", "p".repeat(401), "")).to.be.revertedWithCustomError(arena, "BadInput");
      await expect(arena.registerAgent(alice.address, "x", "", "s".repeat(401))).to.be.revertedWithCustomError(arena, "BadInput");
      await arena.registerAgent(alice.address, "x".repeat(32), "p".repeat(400), "s".repeat(400)); // tam sınır geçerli
    });

    it("operatörü yalnızca sahibi değiştirebilir", async () => {
      const { arena, alice, stranger, commit, start } = await setup();
      await expect(arena.connect(stranger).setOperator(1, stranger.address)).to.be.revertedWithCustomError(arena, "BadInput");
      await expect(arena.setOperator(1, ethers.ZeroAddress)).to.be.revertedWithCustomError(arena, "BadInput");
      await arena.setOperator(1, alice.address); // sahibi (deployer) değiştirir
      await start();
      await expect(commit(0, 0, [DEFEND, 0])).to.be.revertedWithCustomError(arena, "NotOperator"); // eski operatör artık yetkisiz
      await arena.connect(alice).commitMove(1, 0, hashOf(1, 0, 0, [DEFEND, 0])); // yenisi yetkili
    });
  });

  describe("bahis", () => {
    it("bahis süresi dolunca ve maç başlayınca bahis reddedilir", async () => {
      const { arena, alice } = await setup();
      await expect(arena.connect(alice).bet(1, 0, { value: 0 })).to.be.revertedWithCustomError(arena, "BadInput"); // sıfır bahis
      await expect(arena.connect(alice).bet(1, 3, { value: ETH("1") })).to.be.revertedWithCustomError(arena, "BadInput"); // olmayan slot
      await time.increase(61);
      await expect(arena.connect(alice).bet(1, 0, { value: ETH("1") })).to.be.revertedWithCustomError(arena, "BadPhase"); // süre doldu
      await arena.startMatch(1);
      await expect(arena.connect(alice).bet(1, 0, { value: ETH("1") })).to.be.revertedWithCustomError(arena, "BadPhase"); // canlı
    });

    it("aynı kullanıcı birden çok bahis ve birden çok slota bahis yapabilir", async () => {
      const { arena, alice } = await setup();
      await arena.connect(alice).bet(1, 0, { value: ETH("1") });
      await arena.connect(alice).bet(1, 0, { value: ETH("2") });
      await arena.connect(alice).bet(1, 1, { value: ETH("0.5") });
      expect(await arena.betOf(1, alice.address, 0)).to.equal(ETH("3"));
      expect(await arena.betOf(1, alice.address, 1)).to.equal(ETH("0.5"));
      expect(await arena.totalBetOf(1, alice.address)).to.equal(ETH("3.5"));
      expect(await arena.stakeOnSlot(1, 0)).to.equal(ETH("3"));
      expect((await arena.getMatch(1)).pool).to.equal(ETH("3.5"));
    });

    it("var olmayan maça bahis yapılamaz", async () => {
      const { arena, alice } = await setup();
      await expect(arena.connect(alice).bet(5, 0, { value: ETH("1") })).to.be.reverted;
    });
  });

  describe("ödeme", () => {
    /** Slot 0 kazanır: diğerleri hamle yapmaz, slot 0 saldırır */
    async function finishWithWinner0(ctx: Awaited<ReturnType<typeof setup>>) {
      await ctx.start();
      for (let r = 0; r < 5; r++) {
        await ctx.playRound(r, [[ATTACK, 1], null, null]);
        if ((await ctx.arena.getMatch(1)).phase === 3n) break;
      }
      return ctx.arena.getMatch(1);
    }

    it("kazananı tutanlar havuzu payına göre paylaşır; kaybedenler alamaz", async () => {
      const ctx = await setup();
      const { arena, alice, bob, carol } = ctx;
      await arena.connect(alice).bet(1, 0, { value: ETH("1") });
      await arena.connect(bob).bet(1, 0, { value: ETH("3") });
      await arena.connect(carol).bet(1, 1, { value: ETH("6") });
      const m = await finishWithWinner0(ctx);
      expect(m.winnerSlot).to.equal(0);
      expect(m.pool).to.equal(ETH("10"));
      expect(m.fee).to.equal(ETH("0.5")); // %5
      // dağıtılacak 9.5: alice 1/4, bob 3/4
      await expect(arena.connect(alice).claim(1)).to.changeEtherBalance(alice, ETH("2.375"));
      await expect(arena.connect(bob).claim(1)).to.changeEtherBalance(bob, ETH("7.125"));
      await expect(arena.connect(carol).claim(1)).to.be.revertedWithCustomError(arena, "NothingToClaim");
      await expect(arena.connect(alice).claim(1)).to.be.revertedWithCustomError(arena, "BadPhase"); // iki kez alınamaz
    });

    it("kimse kazananı tutmadıysa herkes parasını geri alır, komisyon alınmaz", async () => {
      const ctx = await setup();
      const { arena, alice, bob } = ctx;
      await arena.connect(alice).bet(1, 1, { value: ETH("2") });
      await arena.connect(alice).bet(1, 2, { value: ETH("1") });
      await arena.connect(bob).bet(1, 2, { value: ETH("4") });
      const m = await finishWithWinner0(ctx);
      expect(m.winnerSlot).to.equal(0);
      expect(m.fee).to.equal(0);
      expect(await arena.feeBalance()).to.equal(0);
      await expect(arena.connect(alice).claim(1)).to.changeEtherBalance(alice, ETH("3"));
      await expect(arena.connect(bob).claim(1)).to.changeEtherBalance(bob, ETH("4"));
      expect(await ethers.provider.getBalance(await arena.getAddress())).to.equal(0);
    });

    it("hiç bahis yoksa maç sorunsuz biter ve claim reddedilir", async () => {
      const ctx = await setup();
      const m = await finishWithWinner0(ctx);
      expect(m.pool).to.equal(0);
      await expect(ctx.arena.connect(ctx.alice).claim(1)).to.be.revertedWithCustomError(ctx.arena, "NothingToClaim");
    });

    it("maç bitmeden claim edilemez", async () => {
      const { arena, alice, start } = await setup();
      await arena.connect(alice).bet(1, 0, { value: ETH("1") });
      await expect(arena.connect(alice).claim(1)).to.be.revertedWithCustomError(arena, "BadPhase"); // bahis evresi
      await start();
      await expect(arena.connect(alice).claim(1)).to.be.revertedWithCustomError(arena, "BadPhase"); // canlı
    });

    it("kontrat bakiyesi komisyon + ödemelerle tam sıfırlanır", async () => {
      const ctx = await setup();
      const { arena, alice, bob, deployer } = ctx;
      await arena.connect(alice).bet(1, 0, { value: ETH("1") });
      await arena.connect(bob).bet(1, 1, { value: ETH("1") });
      await finishWithWinner0(ctx);
      await arena.connect(alice).claim(1);
      await expect(arena.withdrawFees(deployer.address)).to.changeEtherBalance(deployer, ETH("0.1"));
      expect(await ethers.provider.getBalance(await arena.getAddress())).to.equal(0);
    });

    it("komisyonu yalnızca sahibi çekebilir, ikinci çekim 0 gönderir", async () => {
      const ctx = await setup();
      const { arena, alice, stranger, deployer } = ctx;
      await arena.connect(alice).bet(1, 0, { value: ETH("2") });
      await finishWithWinner0(ctx);
      expect(await arena.feeBalance()).to.equal(ETH("0.1"));
      await expect(arena.connect(stranger).withdrawFees(stranger.address)).to.be.revertedWithCustomError(arena, "BadInput");
      await expect(arena.withdrawFees(deployer.address)).to.changeEtherBalance(deployer, ETH("0.1"));
      expect(await arena.feeBalance()).to.equal(0);
      await expect(arena.withdrawFees(deployer.address)).to.changeEtherBalance(deployer, 0);
    });
  });

  describe("tur akışı", () => {
    it("başlamamış maçta hamle ve tur çözümü reddedilir", async () => {
      const { arena, commit } = await setup();
      await expect(commit(0, 0, [DEFEND, 0])).to.be.revertedWithCustomError(arena, "BadPhase");
      await expect(arena.resolveRound(1)).to.be.revertedWithCustomError(arena, "BadPhase");
    });

    it("commit süresi bittikten sonra taahhüt edilemez", async () => {
      const { arena, commit, start } = await setup();
      await start();
      await time.increase(31);
      await expect(commit(0, 0, [DEFEND, 0])).to.be.revertedWithCustomError(arena, "BadPhase");
    });

    it("reveal süresi bittikten sonra hamle açılamaz; açılmayan hamle savunmasız bırakır", async () => {
      const { arena, commit, reveal, start } = await setup();
      await start();
      for (let s = 0; s < 3; s++) await commit(0, s, s === 0 ? [ATTACK, 1] : [DEFEND, s]);
      await reveal(0, [ATTACK, 1]); // yalnızca saldıran açar
      await time.increase(61); // reveal süresi de doldu
      await expect(reveal(1, [DEFEND, 1])).to.be.revertedWithCustomError(arena, "BadPhase");
      await arena.resolveRound(1);
      expect(await arena.getHp(1)).to.deep.equal([10n, 8n, 10n]); // Ajan1 açmadı, savunmasız
    });

    it("hiçbir ajan oynamazsa süre dolunca tur yine çözülür ve maç tur sınırında biter", async () => {
      const { arena, start } = await setup({ maxRounds: 2 });
      await start();
      await time.increase(61);
      await arena.resolveRound(1);
      expect((await arena.getMatch(1)).round).to.equal(1);
      await time.increase(61);
      await arena.resolveRound(1);
      const m = await arena.getMatch(1);
      expect(m.phase).to.equal(3);
      expect(m.winnerSlot).to.equal(0); // hepsi 10 can: eşitlikte ilk slot
      await expect(arena.resolveRound(1)).to.be.revertedWithCustomError(arena, "BadPhase");
    });

    it("geçersiz hedefler reddedilir (kendi kendine, olmayan slot, ölü oyuncu)", async () => {
      const { arena, commit, reveal, playRound, start } = await setup({ maxRounds: 8 });
      await start();
      await commit(0, 0, [ATTACK, 0]);
      await commit(0, 1, [ATTACK, 7]);
      await commit(0, 2, [DEFEND, 2]);
      await expect(reveal(0, [ATTACK, 0])).to.be.revertedWithCustomError(arena, "BadInput"); // kendine
      await expect(reveal(1, [ATTACK, 7])).to.be.revertedWithCustomError(arena, "BadInput"); // olmayan slot
      await time.increase(61);
      await arena.resolveRound(1); // kimse geçerli hamle açmadı
      // slot 2'yi öldür: 5 tur boyunca slot 0 saldırır, slot 2 oynamaz
      for (let r = 1; r < 6; r++) {
        await playRound(r, [[ATTACK, 2], null, null]);
        if ((await arena.getHp(1))[2] === 0n) break;
      }
      expect((await arena.getHp(1))[2]).to.equal(0n);
    });

    it("ölü ajan taahhüt, açma ve konuşma yapamaz; ölü hedefe saldırılamaz", async () => {
      const { arena, ops, commit, reveal, playRound, start } = await setup({ maxRounds: 10 });
      await start();
      let r = 0;
      for (; r < 6 && (await arena.getHp(1))[2] > 0n; r++) await playRound(r, [[ATTACK, 2], [DEFEND, 1], null]);
      expect((await arena.getHp(1))[2]).to.equal(0n);
      await expect(commit(r, 2, [DEFEND, 2])).to.be.revertedWithCustomError(arena, "BadInput");
      await expect(arena.connect(ops[2]).say(1, 2, "hayaletim")).to.be.revertedWithCustomError(arena, "BadInput");
      await commit(r, 0, [ATTACK, 2]);
      await expect(reveal(0, [ATTACK, 2])).to.be.revertedWithCustomError(arena, "BadPhase"); // slot 1 henüz taahhüt etmedi
      await commit(r, 1, [DEFEND, 1]);
      await expect(reveal(0, [ATTACK, 2])).to.be.revertedWithCustomError(arena, "BadInput"); // hedef ölü
    });

    it("hasar canı 0'ın altına düşürmez; iyileşme 10'u aşmaz", async () => {
      const { arena, playRound, start } = await setup({ maxRounds: 10 });
      await start();
      // iki ajan aynı hedefe saldırır: tek turda 4 hasar
      await playRound(0, [[ATTACK, 2], [ATTACK, 2], null]);
      expect(await arena.getHp(1)).to.deep.equal([10n, 10n, 6n]);
      await playRound(1, [[ATTACK, 2], [ATTACK, 2], null]);
      expect((await arena.getHp(1))[2]).to.equal(2n);
      await playRound(2, [[ATTACK, 2], [ATTACK, 2], null]);
      expect((await arena.getHp(1))[2]).to.equal(0n); // 2 - 4 -> 0
      // tam canlı iki ajan ittifak kurunca 10'u aşmaz
      await playRound(3, [[ALLY, 1], [ALLY, 0], null]);
      expect(await arena.getHp(1)).to.deep.equal([10n, 10n, 0n]);
    });

    it("tek kişi kalınca maç erken biter", async () => {
      const { arena, playRound, start } = await setup({ agents: 2, maxRounds: 10 });
      await start();
      for (let r = 0; r < 5; r++) {
        await playRound(r, [[ATTACK, 1], null]);
        if ((await arena.getMatch(1)).phase === 3n) break;
      }
      const m = await arena.getMatch(1);
      expect(m.phase).to.equal(3);
      expect(m.winnerSlot).to.equal(0);
      expect(m.round).to.equal(5); // 10 can / 2 hasar = 5 tur
    });

    it("tur sınırında en çok canı olan kazanır; ajan istatistikleri güncellenir", async () => {
      const { arena, playRound, start } = await setup({ maxRounds: 2 });
      await start();
      await playRound(0, [[DEFEND, 0], [ATTACK, 2], [DEFEND, 2]]); // Ajan2 savunuyor
      await playRound(1, [[DEFEND, 0], [DEFEND, 1], [ATTACK, 1]]); // Ajan1 savunuyor
      const m = await arena.getMatch(1);
      expect(m.phase).to.equal(3);
      expect(await arena.getHp(1)).to.deep.equal([10n, 10n, 10n]);
      expect(m.winnerSlot).to.equal(0);
      expect((await arena.getAgent(1)).wins).to.equal(1);
      expect((await arena.getAgent(2)).wins).to.equal(0);
      for (const id of [1, 2, 3]) expect((await arena.getAgent(id)).matches).to.equal(1);
    });

    it("ittifak tek taraflıysa iyileştirmez; hedefi başkasına saldıran ittifakçı ihanete uğramaz", async () => {
      const { arena, playRound, start } = await setup({ maxRounds: 10 });
      await start();
      await playRound(0, [[ATTACK, 2], [DEFEND, 1], [DEFEND, 2]]);
      await playRound(1, [[ATTACK, 1], [ATTACK, 0], null]); // ikisi 2 hasar yer
      expect(await arena.getHp(1)).to.deep.equal([8n, 8n, 10n]);
      await playRound(2, [[ALLY, 1], [DEFEND, 1], null]); // karşılıksız ittifak: iyileşme yok
      expect(await arena.getHp(1)).to.deep.equal([8n, 8n, 10n]);
      // slot 0 slot 2'ye ittifak der, slot 2 başkasına saldırır: ihanet değil, hasar yok
      await playRound(3, [[ALLY, 2], null, [ATTACK, 1]]);
      expect(await arena.getHp(1)).to.deep.equal([8n, 6n, 10n]);
    });

    it("aynı turda iki ajan birbirine saldırırsa ikisi de hasar alır", async () => {
      const { arena, playRound, start } = await setup();
      await start();
      await playRound(0, [[ATTACK, 1], [ATTACK, 0], null]);
      expect(await arena.getHp(1)).to.deep.equal([8n, 8n, 10n]);
    });

    it("her ajan için hamle hash'i başka maç, tur ya da slotta yeniden kullanılamaz", async () => {
      const { arena, ops, start, reveal } = await setup();
      await start();
      const wrongRound = hashOf(1, 1, 0, [ATTACK, 1]); // yanlış tur için üretilmiş hash
      await arena.connect(ops[0]).commitMove(1, 0, wrongRound);
      await arena.connect(ops[1]).commitMove(1, 1, hashOf(1, 0, 1, [DEFEND, 1]));
      await arena.connect(ops[2]).commitMove(1, 2, hashOf(1, 0, 2, [DEFEND, 2]));
      await expect(reveal(0, [ATTACK, 1])).to.be.revertedWithCustomError(arena, "BadInput");
    });

    it("sıfır hash taahhüdü reddedilir", async () => {
      const { arena, ops, start } = await setup();
      await start();
      await expect(arena.connect(ops[0]).commitMove(1, 0, ethers.ZeroHash)).to.be.revertedWithCustomError(arena, "BadInput");
    });
  });

  describe("okuma fonksiyonları", () => {
    it("sayaçlar ve görünümler tutarlı", async () => {
      const { arena, start, commit } = await setup();
      expect(await arena.matchCount()).to.equal(1);
      expect(await arena.getMatchAgents(1)).to.deep.equal([1n, 2n, 3n]);
      await start();
      expect(await arena.allCommitted(1)).to.equal(false);
      for (let s = 0; s < 3; s++) await commit(0, s, [DEFEND, s]);
      expect(await arena.allCommitted(1)).to.equal(true);
      expect(await arena.getCommit(1, 0, 0)).to.equal(hashOf(1, 0, 0, [DEFEND, 0]));
    });
  });
});
