import { NextResponse } from "next/server";
import { isReaction, type ReactionItem } from "@/lib/reactions";

/**
 * Seyirci tepkileri (emoji): cüzdan gerekmez, zincire yazılmaz, kalıcı değildir.
 * Durum bu sürecin belleğinde tutulur: tek sunuculu çalışma (`next start`) için uygundur.
 * Birden çok örnekli/sunucusuz dağıtımda ortak bir depoya (ör. Redis) taşınmalıdır.
 */
type MatchBucket = { seq: number; items: ReactionItem[]; counts: Record<string, number> };
const g = globalThis as unknown as { __reactions?: Map<number, MatchBucket>; __reactionLast?: Map<string, number> };
const buckets = (g.__reactions ??= new Map());
const lastSeen = (g.__reactionLast ??= new Map());

const MAX_ITEMS = 120; // maç başına son tepkiler
const MAX_MATCHES = 200; // bellek sınırı: en eski maç atılır
const MIN_GAP_MS = 600; // aynı istemciden en sık bu aralıkla

const bucketOf = (matchId: number) => {
  let b = buckets.get(matchId);
  if (!b) {
    if (buckets.size >= MAX_MATCHES) buckets.delete(buckets.keys().next().value as number);
    b = { seq: 0, items: [], counts: {} };
    buckets.set(matchId, b);
  }
  return b;
};
const matchIdOf = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n < 1_000_000 ? n : null;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const matchId = matchIdOf(url.searchParams.get("matchId"));
  if (!matchId) return NextResponse.json({ error: "matchId geçersiz" }, { status: 400 });
  const after = Number(url.searchParams.get("after") ?? 0) || 0;
  const b = buckets.get(matchId);
  return NextResponse.json({ latest: b?.seq ?? 0, items: ((b?.items ?? []) as ReactionItem[]).filter((x: ReactionItem) => x.id > after), counts: b?.counts ?? {} });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const matchId = matchIdOf(body?.matchId);
  if (!matchId || !isReaction(body?.emoji)) return NextResponse.json({ error: "geçersiz istek" }, { status: 400 });

  // Basit hız sınırı: istemci adresi başına. (Proxy arkasında x-forwarded-for gerekir.)
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "yerel";
  const now = Date.now();
  if (now - (lastSeen.get(ip) ?? 0) < MIN_GAP_MS) return NextResponse.json({ error: "çok hızlı" }, { status: 429 });
  lastSeen.set(ip, now);
  if (lastSeen.size > 5000) for (const [k, t] of lastSeen) if (now - t > 60_000) lastSeen.delete(k);

  const b = bucketOf(matchId);
  b.seq += 1;
  b.items.push({ id: b.seq, emoji: body.emoji });
  if (b.items.length > MAX_ITEMS) b.items.splice(0, b.items.length - MAX_ITEMS);
  b.counts[body.emoji] = (b.counts[body.emoji] ?? 0) + 1;
  return NextResponse.json({ ok: true, id: b.seq });
}
