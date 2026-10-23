import { createPublicClient, defineChain, formatEther, http, parseAbi } from "viem";

// Varsayılan Monad Testnet; yerel deneme için NEXT_PUBLIC_CHAIN_ID ve NEXT_PUBLIC_RPC_URL verilebilir
const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 10143);
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://testnet-rpc.monad.xyz";

export const monadTestnet = defineChain({
  id: CHAIN_ID,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "MonadVision", url: "https://testnet.monadvision.com" } },
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
});

export const ARENA_ADDRESS = (process.env.NEXT_PUBLIC_ARENA_ADDRESS ?? "") as `0x${string}`;
export const FEE_BPS = 500;
export const MAX_HP = 10;
/** Maç bayrakları (Arena.sol ile aynı): yeni hamleler ve arena olayları */
export const FLAG_ADVANCED = 1;
export const FLAG_EVENTS = 2;

export const arenaAbi = parseAbi([
  "function agentCount() view returns (uint256)",
  "function matchCount() view returns (uint256)",
  "function getAgent(uint256) view returns ((address owner,address operator,string name,string persona,string strategy,uint32 matches,uint32 wins))",
  "function getMatch(uint256) view returns ((uint8 phase,uint64 bettingEnd,uint32 roundSeconds,uint8 round,uint8 maxRounds,uint64 commitDeadline,uint64 revealDeadline,uint8 winnerSlot,uint256 pool,uint256 fee))",
  "function getMatchAgents(uint256) view returns (uint256[])",
  "function getHp(uint256) view returns (uint8[])",
  "function getMove(uint256,uint8,uint8) view returns ((uint8 action,uint8 target,bool submitted))",
  "function getCommit(uint256,uint8,uint8) view returns (bytes32)",
  "function getMessages(uint256,uint8) view returns ((uint8 slot,string text)[])",
  "function stakeOnSlot(uint256,uint8) view returns (uint256)",
  "function matchFlags(uint256) view returns (uint8)",
  "function getCharge(uint256,uint8) view returns (uint8)",
  "function getArenaEvent(uint256,uint8) view returns (uint8 kind,uint8 slot)",
  "function getStats(uint256) view returns ((uint32 attacks,uint32 betrayals,uint32 betrayed,uint32 alliances,uint32 steals,uint32 pacts,uint32 damageDealt,uint32 damageTaken,uint16 streak,uint16 bestStreak))",
  "function betOf(uint256,address,uint8) view returns (uint256)",
  "function claimed(uint256,address) view returns (bool)",
  "function bet(uint256 matchId,uint8 slot) payable",
  "function claim(uint256 matchId)",
  "function registerAgent(address operator,string name,string persona,string strategy) returns (uint256)",
  "function createMatch(uint256[] agentIds,uint32 bettingSeconds,uint32 roundSeconds,uint8 maxRounds) returns (uint256)",
  "function createMatchWithFlags(uint256[] agentIds,uint32 bettingSeconds,uint32 roundSeconds,uint8 maxRounds,uint8 flags) returns (uint256)",
  "function startMatch(uint256 matchId)",
  "function resolveRound(uint256 matchId)",
]);

// Herkese açık RPC saniyede 15 istekle sınırlı: aynı anda yapılan okumalar tek bir multicall3 çağrısında
// toplanır, 429 gelirse bekleyip yeniden denenir.
export const publicClient = createPublicClient({
  chain: monadTestnet,
  batch: CHAIN_ID === 10143 ? { multicall: { wait: 30 } } : undefined, // yerel zincirde multicall3 yok
  transport: http(undefined, { retryCount: 6, retryDelay: 700 }),
});

export const read = <T = unknown>(fn: string, args: unknown[] = []) =>
  publicClient.readContract({ address: ARENA_ADDRESS, abi: arenaAbi, functionName: fn as never, args: args as never }) as Promise<T>;

export const fmt = (v: bigint) => {
  const n = Number(formatEther(v));
  return n === 0 ? "0" : n < 0.001 ? "<0,001" : n.toLocaleString("tr-TR", { maximumFractionDigits: 3 });
};

export const explorerTx = (hash: string) => `https://testnet.monadvision.com/tx/${hash}`;
