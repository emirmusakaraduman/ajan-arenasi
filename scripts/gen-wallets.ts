import { Wallet } from "ethers";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

/**
 * Testnet için 4 yeni cüzdan üretip .env dosyasına yazar (deployer + 3 ajan operatörü).
 * Anahtarlar ekrana basılmaz; yalnızca adresler görünür. .env git'e girmez.
 */
const envPath = ".env";
const current = existsSync(envPath) ? readFileSync(envPath, "utf8") : readFileSync(".env.example", "utf8");
if (/^DEPLOYER_PRIVATE_KEY=0x/m.test(current)) {
  console.log(".env içinde zaten anahtar var, dokunmadım. Silip yeniden çalıştırabilirsin.");
  process.exit(0);
}

const names = ["DEPLOYER_PRIVATE_KEY", "OPERATOR_PK_1", "OPERATOR_PK_2", "OPERATOR_PK_3"];
let out = current.replace(/^DEPLOYER_PRIVATE_KEY=.*\n?/m, "").trimEnd() + "\n";
for (const n of names) {
  const w = Wallet.createRandom();
  out += `${n}=${w.privateKey}\n`;
  console.log(`${n.replace("_PRIVATE_KEY", "").padEnd(12)} ${w.address}`);
}
writeFileSync(envPath, out);
console.log("\nAdresleri https://faucet.monad.xyz adresinden fonla (deployer en az 1 MON, operatörler 0.2'şer MON).");
