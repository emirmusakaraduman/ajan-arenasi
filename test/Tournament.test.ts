import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const ATTACK = 1, ALLY = 2;
const coder = ethers.AbiCoder.defaultAbiCoder();
const salt = ethers.zeroPadValue("0x01", 32);
const hashOf = (matchId: bigint, slot: number, a: number, t: number) =>
  ethers.keccak256(coder.encode(["uint256", "uint8", "uint8", "uint8", "uint8", "bytes32"], [matchId, 0, slot, a, t, salt]));

describe("Tournament", () => {
  async function setup(agents = 4) {
    const signers = await ethers.getSigners();
    const ops = signers.slice(5, 5 + agents);
    const arena = await ethers.deployContract("Arena");
    const tour = await ethers.deployContract("Tournament", [await arena.getAddress()]);
    for (let i = 0; i < agents; i++) await arena.registerAgent(ops[i].address, `Ajan${i + 1}`, "", "");
    const ids = Array.from({ length: agents }, (_, i) => i + 1);

    /** Arena maçını 1 turda bitirir: `winnerAgent` slotu rakibine saldırır, rakip ittifak teklif edip ihanete uğrar */
    const finishMatch = async (matchId: bigint, winnerAgent: number) => {
      await time.increase(70);
      await arena.startMatch(matchId);
      const agentsIn: bigint[] = await arena.getMatchAgents(matchId);
      const w = agentsIn.findIndex((a) => Number(a) === winnerAgent);
      const l = 1 - w;
      const op = (slot: number) => ops[Number(agentsIn[slot]) - 1];
      await arena.connect(op(w)).commitMove(matchId, w, hashOf(matchId, w, ATTACK, l));
      await arena.connect(op(l)).commitMove(matchId, l, hashOf(matchId, l, ALLY, w));
      await arena.connect(op(w)).revealMove(matchId, w, ATTACK, l, salt);
      await arena.connect(op(l)).revealMove(matchId, l, ALLY, w, salt);
      await arena.resolveRound(matchId);
    };
    const create = (list = ids, flags = 0) => tour.createTournament(list, 60, 30, 1, flags);
    return { arena, tour, ops, ids, finishMatch, create };
  }

  it("4 kişilik turnuva: yarı final, final ve şampiyon", async () => {
    const { arena, tour, finishMatch, create } = await setup();
    await create();
    expect(await tour.tournamentCount()).to.equal(1);
    const t0 = await tour.getTournament(1);
    expect(t0.size).to.equal(4);
    expect(t0.rounds).to.equal(2);
    expect(t0.champion).to.equal(0);

    // tur 0: (1,2) ve (3,4)
    const r0 = await tour.getRoundMatches(1, 0);
    expect(r0.length).to.equal(2);
    expect(await arena.getMatchAgents(r0[0])).to.deep.equal([1n, 2n]);
    expect(await arena.getMatchAgents(r0[1])).to.deep.equal([3n, 4n]);

    await expect(tour.advance(1)).to.be.revertedWithCustomError(tour, "NotReady"); // maçlar bitmedi
    await finishMatch(r0[0], 2);
    await expect(tour.advance(1)).to.be.revertedWithCustomError(tour, "NotReady"); // biri bitti
    await finishMatch(r0[1], 3);
    await tour.advance(1);

    // final: ajan 2 ve 3
    expect((await tour.getTournament(1)).round).to.equal(1);
    expect(await tour.getRoundPlayers(1, 1)).to.deep.equal([2n, 3n]);
    const r1 = await tour.getRoundMatches(1, 1);
    expect(r1.length).to.equal(1);
    expect(await arena.getMatchAgents(r1[0])).to.deep.equal([2n, 3n]);
    await finishMatch(r1[0], 3);
    await expect(tour.advance(1)).to.emit(tour, "TournamentFinished").withArgs(1, 3);
    expect((await tour.getTournament(1)).champion).to.equal(3);
    await expect(tour.advance(1)).to.be.revertedWithCustomError(tour, "AlreadyFinished");
  });

  it("2 kişilik turnuva tek maçtır", async () => {
    const { tour, finishMatch, create } = await setup(2);
    await create();
    const [m] = await tour.getRoundMatches(1, 0);
    await finishMatch(m, 1);
    await tour.advance(1);
    expect((await tour.getTournament(1)).champion).to.equal(1);
  });

  it("8 kişilik turnuva üç turda biter", async () => {
    const { arena, tour, finishMatch, create } = await setup(8);
    await create();
    expect((await tour.getTournament(1)).rounds).to.equal(3);
    // her maçı düşük numaralı ajan kazanır
    for (let r = 0; r < 3; r++) {
      const ms = await tour.getRoundMatches(1, r);
      expect(ms.length).to.equal(4 >> r);
      for (const m of ms) await finishMatch(m, Number((await arena.getMatchAgents(m))[0]));
      await tour.advance(1);
    }
    expect((await tour.getTournament(1)).champion).to.equal(1);
  });

  it("geçersiz katılımcı sayısı ve tekrarlı ajan reddedilir", async () => {
    const { tour, create } = await setup(8);
    await expect(create([1, 2, 3])).to.be.revertedWithCustomError(tour, "BadInput");
    await expect(create([1])).to.be.revertedWithCustomError(tour, "BadInput");
    await expect(create([1, 1])).to.be.revertedWithCustomError(tour, "BadInput");
    await expect(create([1, 2, 3, 4, 5, 6, 7, 8, 9])).to.be.revertedWithCustomError(tour, "BadInput");
    await expect(tour.advance(9)).to.be.reverted;
  });

  it("bayraklar turnuva maçlarına aktarılır", async () => {
    const { arena, tour, create } = await setup();
    await create([1, 2, 3, 4], 3);
    const [m] = await tour.getRoundMatches(1, 0);
    expect(await arena.matchFlags(m)).to.equal(3);
  });

  it("turnuvaya katılan ajanlar aynı anda birden çok turnuvada yer alabilir", async () => {
    const { tour, create } = await setup();
    await create();
    await create();
    expect(await tour.tournamentCount()).to.equal(2);
    expect(await tour.getEntrants(2)).to.deep.equal([1n, 2n, 3n, 4n]);
  });
});
