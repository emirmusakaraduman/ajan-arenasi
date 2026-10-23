import { ethers } from "hardhat";

/** Var olan ajanlarla yeni maç açar. AGENT_IDS="4,5,6" BETTING_SECONDS=300 ROUND_SECONDS=10 MAX_ROUNDS=8 FLAGS=3 (isteğe bağlı) */
async function main() {
  const arena = await ethers.getContractAt("Arena", process.env.ARENA_ADDRESS!);
  const ids = (process.env.AGENT_IDS ?? "4,5,6").split(",").map(Number);
  const args = [ids, Number(process.env.BETTING_SECONDS ?? 300), Number(process.env.ROUND_SECONDS ?? 10), Number(process.env.MAX_ROUNDS ?? 8)] as const;
  // FLAGS: 1 = gelişmiş hamleler (Çal, Güç topla, Pakt), 2 = arena olayları, 3 = ikisi
  const flags = Number(process.env.FLAGS ?? 0);
  await (await (flags ? arena.createMatchWithFlags(...args, flags) : arena.createMatch(...args))).wait();
  console.log("MATCH_ID=" + (await arena.matchCount()));
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
