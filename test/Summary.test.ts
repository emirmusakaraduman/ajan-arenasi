import { expect } from "chai";
import { replayAll, type Move } from "../web/lib/replay";
import { summarize } from "../web/lib/summary";

const DEFEND = 0, ATTACK = 1, ALLY = 2, STEAL = 3;
const mv = (action: number, target: number): Move => ({ action, target, submitted: true });
const idle: Move = { action: 0, target: 0, submitted: false };

/** Maç sonu özeti: replay olaylarından ajan başına istatistik ve ödüller */
describe("Maç özeti (web/lib/summary)", () => {
  it("ihanet, ittifak ve çalma doğru sayılır; ödüller doğru ajana gider", () => {
    const rounds: Move[][] = [
      [mv(ATTACK, 1), mv(ALLY, 0), mv(DEFEND, 2)], // A, ittifak teklif eden B'ye saldırır: ihanet 4
      [mv(ALLY, 2), mv(DEFEND, 1), mv(ALLY, 0)],   // A ve C karşılıklı ittifak
      [mv(DEFEND, 0), mv(STEAL, 2), mv(ALLY, 0)],  // B, savunmayan C'den can çalar
    ];
    const { agents, awards } = summarize(replayAll(3, rounds), 3);
    const [a, b, c] = agents;
    expect(a).to.include({ dealt: 4, taken: 0, betrayals: 1, betrayed: 0, alliances: 1, steals: 0 });
    expect(b).to.include({ dealt: 1, taken: 4, betrayals: 0, betrayed: 1, steals: 1 });
    expect(c).to.include({ dealt: 0, taken: 1, alliances: 1 });
    expect(awards.topDamage).to.deep.equal({ slot: 0, value: 4 });
    expect(awards.bigBetrayal).to.deep.equal({ from: 0, to: 1, round: 1, dmg: 4 });
    expect(awards.topThief).to.deep.equal({ slot: 1, value: 1 });
    expect(awards.mostAllies).to.deep.equal({ slot: 0, value: 1 }); // eşitlikte ilk slot
    expect(awards.firstOut).to.equal(null);
  });

  it("elenen ajan ve elendiği tur kaydedilir", () => {
    // B hiç hamle vermez: A her turda 2 hasar vurur, 5. turda B elenir
    const rounds: Move[][] = Array.from({ length: 5 }, () => [mv(ATTACK, 1), idle]);
    const { agents, awards } = summarize(replayAll(2, rounds), 2);
    expect(agents[1].outRound).to.equal(5);
    expect(agents[0].outRound).to.equal(null);
    expect(agents[0].dealt).to.equal(10);
    expect(agents[1].taken).to.equal(10);
    expect(awards.firstOut).to.deep.equal({ slot: 1, round: 5 });
  });

  it("ağır saldırı sayılır; sessiz maçta ödül çıkmaz", () => {
    const heavy = summarize(replayAll(2, [[mv(4, 1), mv(DEFEND, 1)], [idle, mv(DEFEND, 1)]]), 2);
    expect(heavy.agents[0].heavy).to.equal(1);
    expect(heavy.agents[0].dealt).to.equal(1); // savunan hedefi yalnızca deler
    const quiet = summarize(replayAll(2, [[mv(DEFEND, 0), mv(DEFEND, 1)]]), 2);
    expect(quiet.awards).to.deep.equal({ topDamage: null, bigBetrayal: null, topThief: null, firstOut: null, mostAllies: null });
  });

  it("hiç tur yoksa boş özet döner", () => {
    const { agents, awards } = summarize([], 3);
    expect(agents).to.have.length(3);
    expect(awards.topDamage).to.equal(null);
  });
});
