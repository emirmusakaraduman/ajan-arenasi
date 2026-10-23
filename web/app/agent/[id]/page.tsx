import { Suspense } from "react";
import { AgentProfile } from "@/components/AgentProfile";
import { ProfileSkeleton } from "@/components/Skeletons";

type Params = Promise<{ id: string }>;

export default function AgentPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<ProfileSkeleton />}>
      <Agent params={params} />
    </Suspense>
  );
}

async function Agent({ params }: { params: Params }) {
  const { id } = await params;
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? <AgentProfile agentId={n} /> : <p className="text-mute">Geçersiz ajan numarası.</p>;
}
