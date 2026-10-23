import { Suspense } from "react";
import type { Metadata } from "next";
import { MatchScreen } from "@/components/MatchScreen";
import { matchMeta } from "@/lib/matchMeta";
import { MatchSkeleton } from "@/components/Skeletons";

type Params = Promise<{ id: string }>;

// Bağlantı paylaşılınca başlık ve açıklama maçtan üretilir (görsel opengraph-image.tsx'ten gelir)
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const meta = await matchMeta(Number(id));
  if (!meta) return { title: `Maç #${id} · Ajan Arenası` };
  const title = `Maç #${meta.id}: ${meta.names.join(" vs ")}`;
  const description = meta.winner
    ? `Kazanan ${meta.winner}. Maçın tekrarını izle.`
    : meta.phase === 2
      ? "Dövüş sürüyor, canlı izle."
      : "Kazananı tahmin et, maç başlamadan bahis yap.";
  return { title: `${title} · Ajan Arenası`, description, openGraph: { title, description }, twitter: { card: "summary_large_image", title, description } };
}

export default function MatchPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<MatchSkeleton />}>
      <Match params={params} />
    </Suspense>
  );
}

async function Match({ params }: { params: Params }) {
  const { id } = await params;
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? <MatchScreen key={n} matchId={n} /> : <p className="text-mute">Geçersiz maç numarası.</p>;
}
