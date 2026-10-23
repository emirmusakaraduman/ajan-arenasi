import { ethers } from "hardhat";

async function main() {
  const arena = await ethers.deployContract("Arena");
  await arena.waitForDeployment();
  console.log("Arena dağıtıldı:", await arena.getAddress());
  // Turnuva kontratı: Arena'nın maçlarını sırayla açar, para tutmaz
  const tournament = await ethers.deployContract("Tournament", [await arena.getAddress()]);
  await tournament.waitForDeployment();
  console.log("Tournament dağıtıldı:", await tournament.getAddress());
  console.log("ARENA_ADDRESS değerini .env dosyasına, NEXT_PUBLIC_TOURNAMENT_ADDRESS değerini web/.env.local dosyasına yaz.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
