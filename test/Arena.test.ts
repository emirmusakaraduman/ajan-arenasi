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

describe("Arena", () => {
  async function setup() {
    const [deployer, alice, bob, op1, op2, op3] = await ethers.getSigners();
    const arena = await ethers.deployContract("Arena");
    await arena.registerAgent(op1.address, "Kurt", "acımasız", "hep saldır");
    await arena.registerAgent(op2.address, "Tilki", "sinsi", "ittifak kur sonra ihanet et");
    await arena.registerAgent(op3.address, "Kaplumbağa", "temkinli", "hep savun");
    await arena.createMatch([1, 2, 3], 60, 30, 5);
    const ops = [op1, op2, op3];

    const commit = (round: number, slot: number, mv: MoveSpec) =>
      arena.connect(ops[slot]).commitMove(1, slot, hashOf(1, round, slot, mv));
    const reveal = (slot: number, mv: MoveSpec) =>
      arena.connect(ops[slot]).revealMove(1, slot, mv[0], mv[1], saltOf(slot));
    /** herkes taahhüt eder, sonra açar, sonra tur çözülür */
    const playRound = async (round: number, moves: MoveSpec[]) => {
      for (let s = 0; s < moves.length; s++) await commit(round, s, moves[s]);
      for (let s = 0; s < moves.length; s++) await reveal(s, moves[s]);
      await arena.resolveRound(1);
    };
    const start = async () => {
      await time.increase(61);
      await arena.startMatch(1);
    };
    return { arena, deployer, alice, bob, ops, commit, reveal, playRound, start };
  }

  it("ajan kaydeder ve maç açar", async () => {
    const { arena } = await setup();
    expect(await arena.agentCount()).to.equal(3);
    expect((await arena.getMatch(1)).phase).to.equal(1);
    expect(await arena.getHp(1)).to.deep.equal([10n, 10n, 10n]);
  });

  it("bahis süresi dolmadan başlatılamaz", async () => {
    const { arena } = await setup();
    await expect(arena.startMatch(1)).to.be.revertedWithCustomError(arena, "BadPhase");
  });

  it("ihanet 4, normal saldırı 2 hasar verir; savunma bloklar", async () => {
    const { arena, playRound, start } = await setup();
    await start();
    // Tilki(1) Kurt(0)'a ittifak teklif eder, Kurt ona saldırır -> ihanet 4 hasar
    await playRound(0, [[ATTACK, 1], [ALLY, 0], [DEFEND, 2]]);
    expect(await arena.getHp(1)).to.deep.equal([10n, 6n, 10n]);
    // Tur 2: Kurt Kaplumbağa'ya saldırır ama o savunuyor
    await playRound(1, [[ATTACK, 2], [DEFEND, 1], [DEFEND, 2]]);
    expect(await arena.getHp(1)).to.deep.equal([10n, 6n, 10n]);
  });

  it("karşılıklı ittifak iyileştirir", async () => {
    const { arena, playRound, start } = await setup();
    await start();
    await playRound(0, [[ATTACK, 2], [DEFEND, 1], [DEFEND, 2]]); // Kaplumbağa bloklar
    await playRound(1, [[ATTACK, 1], [ATTACK, 0], [DEFEND, 2]]); // Kurt ve Tilki 2 hasar yer
    expect(await arena.getHp(1)).to.deep.equal([8n, 8n, 10n]);
    await playRound(2, [[ALLY, 1], [ALLY, 0], [DEFEND, 2]]);
    expect(await arena.getHp(1)).to.deep.equal([9n, 9n, 10n]);
  });

  it("herkes taahhüt etmeden hamle açılamaz; süre dolunca açılır, açmayan savunmasız kalır", async () => {
    const { arena, commit, reveal, start } = await setup();
    await start();
    await commit(0, 0, [ATTACK, 2]);
    await commit(0, 1, [ALLY, 0]);
    await expect(reveal(0, [ATTACK, 2])).to.be.revertedWithCustomError(arena, "BadPhase"); // Kaplumbağa taahhüt etmedi
    await time.increase(31); // commit süresi doldu
    await reveal(0, [ATTACK, 2]);
    await reveal(1, [ALLY, 0]);
    await expect(arena.resolveRound(1)).to.be.revertedWithCustomError(arena, "BadPhase"); // reveal süresi sürüyor
    await time.increase(31);
    await arena.resolveRound(1);
    expect((await arena.getHp(1))[2]).to.equal(8n); // Kaplumbağa hamle yapmadı, savunmasız
  });

  it("hash'e uymayan hamle ve tekrar taahhüt reddedilir", async () => {
    const { arena, commit, reveal, start } = await setup();
    await start();
    await commit(0, 0, [ATTACK, 1]);
    await expect(commit(0, 0, [DEFEND, 0])).to.be.revertedWithCustomError(arena, "BadInput"); // değiştirilemez
    await commit(0, 1, [DEFEND, 1]);
    await commit(0, 2, [DEFEND, 2]);
    await expect(reveal(0, [ATTACK, 2])).to.be.revertedWithCustomError(arena, "BadInput"); // taahhütten farklı hamle
    await reveal(0, [ATTACK, 1]);
    await expect(reveal(0, [ATTACK, 1])).to.be.revertedWithCustomError(arena, "BadInput"); // ikinci kez açılamaz
  });

  it("ajanlar pazarlık mesajı bırakır; sınırlar işler", async () => {
    const { arena, ops, alice, playRound, start } = await setup();
    await start();
    await arena.connect(ops[1]).say(1, 1, "Kurt, ittifak kuralım mı?");
    await arena.connect(ops[0]).say(1, 0, "Önce Kaplumbağa'yı yiyelim.");
    await arena.connect(ops[1]).say(1, 1, "Anlaştık.");
    const msgs = await arena.getMessages(1, 0);
    expect(msgs.length).to.equal(3);
    expect(msgs[0].slot).to.equal(1);
    expect(msgs[0].text).to.equal("Kurt, ittifak kuralım mı?");
    await expect(arena.connect(ops[1]).say(1, 1, "üçüncü")).to.be.revertedWithCustomError(arena, "BadInput"); // tur başına 2
    await expect(arena.connect(ops[0]).say(1, 0, "")).to.be.revertedWithCustomError(arena, "BadInput");
    await expect(arena.connect(ops[0]).say(1, 0, "x".repeat(141))).to.be.revertedWithCustomError(arena, "BadInput");
    await expect(arena.connect(alice).say(1, 0, "ben")).to.be.revertedWithCustomError(arena, "NotOperator");
    // yeni turda sayaç sıfırlanır, eski tur mesajları korunur
    await playRound(0, [[DEFEND, 0], [DEFEND, 1], [DEFEND, 2]]);
    await arena.connect(ops[1]).say(1, 1, "Yeni tur");
    expect((await arena.getMessages(1, 1)).length).to.equal(1);
    expect((await arena.getMessages(1, 0)).length).to.equal(3);
  });

  it("konuşma yalnızca canlı maçta ve commit süresi içinde", async () => {
    const { arena, ops, start } = await setup();
    await expect(arena.connect(ops[0]).say(1, 0, "erken")).to.be.revertedWithCustomError(arena, "BadPhase"); // bahis evresi
    await start();
    await time.increase(31); // commit süresi doldu
    await expect(arena.connect(ops[0]).say(1, 0, "geç")).to.be.revertedWithCustomError(arena, "BadPhase");
  });

  it("yanlış operatör hamle gönderemez", async () => {
    const { arena, alice, start } = await setup();
    await start();
    await expect(arena.connect(alice).commitMove(1, 0, ethers.id("x"))).to.be.revertedWithCustomError(arena, "NotOperator");
  });

  it("bahis, maç sonu ve ödeme", async () => {
    const { arena, alice, bob, playRound, start } = await setup();
    await arena.connect(alice).bet(1, 0, { value: ethers.parseEther("1") });
    await arena.connect(bob).bet(1, 1, { value: ethers.parseEther("3") });
    await start();
    for (let r = 0; r < 5; r++) {
      await playRound(r, [[ATTACK, 2], [DEFEND, 1], [ATTACK, 0]]);
      if ((await arena.getMatch(1)).phase === 3n) break;
    }
    const m = await arena.getMatch(1);
    expect(m.phase).to.equal(3);
    expect(m.winnerSlot).to.equal(1); // Kurt ve Kaplumbağa birbirini yedi, Tilki hep savundu
    await expect(arena.connect(alice).claim(1)).to.be.revertedWithCustomError(arena, "NothingToClaim");
    const before = await ethers.provider.getBalance(bob.address);
    const tx = await arena.connect(bob).claim(1);
    const rc = await tx.wait();
    const after = await ethers.provider.getBalance(bob.address);
    // havuz 4 MON, %5 komisyon -> bob 3.8 MON alır
    expect(after - before + rc!.gasUsed * rc!.gasPrice).to.equal(ethers.parseEther("3.8"));
    await expect(arena.connect(bob).claim(1)).to.be.revertedWithCustomError(arena, "BadPhase");
  });
});

