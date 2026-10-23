import { ARENA_ADDRESS, read } from "./arena";
import type { RawAgent, RawMatch } from "./rawTypes";

export type MatchMeta = { id: number; names: string[]; phase: number; winner: string | null; pool: bigint };

/** Paylaşım önizlemesi (başlık ve OG görseli) için maçın özeti. Zincire ulaşılamazsa null. */
export async function matchMeta(id: number): Promise<MatchMeta | null> {
  if (!ARENA_ADDRESS || !Number.isInteger(id) || id < 1) return null;
  try {
    const [m, ids] = await Promise.all([read<RawMatch>("getMatch", [BigInt(id)]), read<bigint[]>("getMatchAgents", [BigInt(id)])]);
    if (!ids.length) return null;
    const agents = await Promise.all(ids.map((a) => read<RawAgent>("getAgent", [a])));
    const names = agents.map((a) => String(a.name));
    const phase = Number(m.phase);
    return { id, names, phase, winner: phase === 3 ? names[Number(m.winnerSlot)] ?? null : null, pool: m.pool };
  } catch {
    return null;
  }
}
