import { Suspense } from "react";
import { TournamentBracket } from "@/components/TournamentBracket";
import { BracketSkeleton } from "@/components/Skeletons";

type Params = Promise<{ id: string }>;

export default function TournamentBracketPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<BracketSkeleton />}>
      <Bracket params={params} />
    </Suspense>
  );
}

async function Bracket({ params }: { params: Params }) {
  const { id } = await params;
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? <TournamentBracket tid={n} /> : <p className="text-mute">Geçersiz turnuva numarası.</p>;
}
