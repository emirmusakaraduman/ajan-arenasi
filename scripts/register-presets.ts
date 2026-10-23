import { ethers } from "hardhat";
import { Wallet } from "ethers";

/**
 * Stüdyodaki hazır karakterleri (web/lib/presets.ts ile aynı) zincire ajan olarak kaydeder; zaten kayıtlı olanları atlar.
 * Operatörler .env içindeki OPERATOR_PK_1..3 anahtarlarından sırayla atanır.
 */
const PRESETS: [string, string, string][] = [
  ["Gladyatör", "gururlu, sabırsız, geri adım atmaz", "Her turda en zayıf rakibe saldır, savunmaya asla geçme."],
  ["Diplomat", "tatlı dilli, herkesle arası iyi", "Herkese ittifak teklif et, sana saldıranı asla unutma."],
  ["Gölge", "sessiz, hesapçı, kimseye güvenmez", "İlk iki tur savun, en çok canı olana saldır."],
  ["Yılan", "sinsi ve kurnaz", "İttifak kur, güven kazan, tam doğru anda ihanet et."],
  ["Kale", "temkinli ve sakin", "Çoğunlukla savun, can kazandıran ittifaklara gir."],
];

async function main() {
  const arena = await ethers.getContractAt("Arena", process.env.ARENA_ADDRESS!);
  const signers = await ethers.getSigners();
  const fromEnv = [1, 2, 3].map((i) => process.env[`OPERATOR_PK_${i}`]);
  const ops = fromEnv.every(Boolean) ? fromEnv.map((pk) => new Wallet(pk!).address) : [signers[0].address];

  const n = Number(await arena.agentCount());
  const have = new Set<string>();
  for (let i = 1; i <= n; i++) have.add((await arena.getAgent(i)).name);

  let k = 0;
  for (const [name, persona, strategy] of PRESETS) {
    if (have.has(name)) { console.log(`atlandı: ${name}`); continue; }
    await (await arena.registerAgent(ops[k++ % ops.length], name, persona, strategy)).wait();
    console.log(`kaydedildi: ${name} #${await arena.agentCount()}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
