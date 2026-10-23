import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

const pk = process.env.DEPLOYER_PRIVATE_KEY;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: { evmVersion: "cancun", optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    // `npm run node` yerelde 1 sn aralıkla blok üretir (Monad gibi sürekli blok akışı).
    // LOCAL_INTERVAL=ms ile aralık, LOCAL_AUTOMINE=0 ile "yalnızca aralıkla" madencilik seçilir: her işlemde blok üretilmediği için
    // blok zamanı sistem saatinden kopmaz (otomatik madencilik hızlı işlem dizilerinde zamanı ileri sarar).
    hardhat: process.env.LOCAL_INTERVAL
      ? {
          mining: { auto: process.env.LOCAL_AUTOMINE !== "0", interval: Number(process.env.LOCAL_INTERVAL) || 1000 },
          // Saniyeden sık blokta aynı zaman damgası serbest: aksi halde zincir saati gerçek saatin önüne kaçar
          allowBlocksWithSameTimestamp: true,
        }
      : {},
    local: { url: process.env.LOCAL_RPC ?? "http://127.0.0.1:8546", chainId: 31337 },
    monadTestnet: {
      url: process.env.MONAD_TESTNET_RPC || "https://testnet-rpc.monad.xyz",
      chainId: 10143,
      accounts: pk ? [pk] : [],
    },
  },
};

export default config;
