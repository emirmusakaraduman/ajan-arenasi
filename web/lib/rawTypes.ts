/** Kontrat okumalarının ham (viem'in döndürdüğü) şekilleri. `read<any>` yerine bunlar kullanılır. */
export type RawAgent = {
  owner: string; operator: string; name: string; persona: string; strategy: string;
  matches: number | bigint; wins: number | bigint;
};

export type RawMatch = {
  phase: number | bigint; bettingEnd: number | bigint; roundSeconds: number | bigint; round: number | bigint; maxRounds: number | bigint;
  commitDeadline: number | bigint; revealDeadline: number | bigint; winnerSlot: number | bigint; pool: bigint; fee: bigint;
};

export type RawMove = { action: number | bigint; target: number | bigint; submitted: boolean };

export type RawTournament = {
  creator: string; size: number | bigint; round: number | bigint; rounds: number | bigint;
  bettingSeconds: number | bigint; roundSeconds: number | bigint; maxRounds: number | bigint; flags: number | bigint; champion: number | bigint;
};

/** viem hata nesnelerinden kullanıcıya gösterilecek kısa mesaj */
export const shortMsg = (e: unknown, fallback = "Zincire ulaşılamadı") =>
  (e as { shortMessage?: string } | null)?.shortMessage ?? fallback;

/** Ham ajan okumasını arayüzün kullandığı Agent biçimine çevirir */
export const toAgent = (x: RawAgent) => ({ ...x, matches: Number(x.matches), wins: Number(x.wins) });
