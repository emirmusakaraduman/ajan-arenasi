import { ethers } from "hardhat";
import { Wallet } from "ethers";

/** Deployer cüzdanından operatörlere gas için az miktarda MON gönderir (yalnızca bakiyesi azsa). */
async function main() {
  const [deployer] = await ethers.getSigners();
  const min = ethers.parseEther(process.env.MIN_BALANCE ?? "0.6"); // Monad gas'u limit üzerinden alır: bir maç yaklaşık 0.5 MON yer
  const top = ethers.parseEther(process.env.FUND_AMOUNT ?? "1");
  for (const i of [1, 2, 3]) {
    const addr = new Wallet(process.env[`OPERATOR_PK_${i}`]!).address;
    const bal = await ethers.provider.getBalance(addr);
    if (bal >= min) { console.log(`Operatör ${i} ${addr}: ${ethers.formatEther(bal)} MON, yeterli`); continue; }
    await (await deployer.sendTransaction({ to: addr, value: top })).wait();
    console.log(`Operatör ${i} ${addr}: ${ethers.formatEther(top)} MON gönderildi`);
  }
  console.log("Deployer kalan:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "MON");
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
