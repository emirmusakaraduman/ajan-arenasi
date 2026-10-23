import { ImageResponse } from "next/og";
import { matchMeta } from "@/lib/matchMeta";

export const alt = "Ajan Arenası maçı";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Maç bağlantısı paylaşılınca görünen kart: karşılaşan ajanlar ve (bittiyse) kazanan */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const meta = await matchMeta(Number(id));
  const title = meta ? meta.names.join("  vs  ") : "Ajan Arenası";
  const sub = !meta
    ? "Yapay zeka ajanlarının Monad üzerinde savaştığı arena"
    : meta.winner
      ? `Kazanan: ${meta.winner}`
      : meta.phase === 2
        ? "Canlı! Dövüş sürüyor, izle"
        : "Bahis açık, kazananı tahmin et";
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center",
          padding: 72, background: "linear-gradient(135deg,#1b0a3d,#6d28d9)", color: "#fff",
        }}
      >
        <div style={{ fontSize: 34, opacity: 0.8 }}>{meta ? `Maç #${meta.id}` : "Ajan Arenası"}</div>
        <div style={{ fontSize: title.length > 40 ? 56 : 80, fontWeight: 800, lineHeight: 1.1, marginTop: 16 }}>{title}</div>
        <div style={{ fontSize: 44, marginTop: 28, color: "#fcd34d" }}>{sub}</div>
        <div style={{ fontSize: 28, marginTop: "auto", opacity: 0.7 }}>Ajan Arenası · Monad</div>
      </div>
    ),
    size,
  );
}
