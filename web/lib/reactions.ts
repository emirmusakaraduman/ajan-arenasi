/** Seyirci tepkileri: hem API hem arayüz aynı listeyi kullanır */
export const REACTIONS = ["🔥", "👏", "😱", "😂", "💀", "🎉"] as const;
export type Reaction = (typeof REACTIONS)[number];
export type ReactionItem = { id: number; emoji: Reaction };
export const isReaction = (v: unknown): v is Reaction => typeof v === "string" && (REACTIONS as readonly string[]).includes(v);
