import { ethers } from "hardhat";
import { Wallet } from "ethers";

/**
 * Yerelde (localhost) ya da testnette demo maçı hazırlar: 3 ajan kaydeder ve maç açar.
 * Operatörler .env içindeki OPERATOR_PK_1..3 anahtarlarından türetilir; yoksa hardhat hesapları kullanılır.
 */
async function main() {
  const addr = process.env.ARENA_ADDRESS;
  const arena = addr ? await ethers.getContractAt("Arena", addr) : await ethers.deployContract("Arena");
  await arena.waitForDeployment();
  const arenaAddr = await arena.getAddress();

  const signers = await ethers.getSigners();
  const fromEnv = [1, 2, 3].map((i) => process.env[`OPERATOR_PK_${i}`]);
  const ops = fromEnv.every(Boolean)
    ? fromEnv.map((pk) => new Wallet(pk!).address) // anahtarlardan türetilen operatör adresleri
    : [signers[1].address, signers[2].address, signers[3].address];
  const bettingSeconds = Number(process.env.BETTING_SECONDS ?? 15);
  const roundSeconds = Number(process.env.ROUND_SECONDS ?? 6);

  // Hazır karakterler (web/lib/presets.ts ile aynı adlar)
  const personas = [
    ["Gladyatör", "gururlu, sabırsız, geri adım atmaz", "Her turda en zayıf rakibe saldır, savunmaya asla geçme."],
    ["Yılan", "sinsi ve kurnaz", "İttifak kur, güven kazan, tam doğru anda ihanet et."],
    ["Kale", "temkinli ve sakin", "Çoğunlukla savun, can kazandıran ittifaklara gir."],
  ];
  const first = Number(await arena.agentCount()) + 1;
  for (let i = 0; i < 3; i++) {
    await (await arena.registerAgent(ops[i], personas[i][0], personas[i][1], personas[i][2])).wait();
  }
  await (await arena.createMatch([first, first + 1, first + 2], bettingSeconds, roundSeconds, 8)).wait();
  const matchId = await arena.matchCount();
  console.log(`ARENA_ADDRESS=${arenaAddr}\nMATCH_ID=${matchId}\nAGENT_IDS=${first},${first + 1},${first + 2}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
