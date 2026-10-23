/** Yükleme iskeletleri: veri gelene kadar sayfanın şeklini gösterir, boş mor alan bırakmaz. */

export function Skel({ className = "" }: { className?: string }) {
  return <div className={`skel ${className}`} aria-hidden />;
}

function Wrap({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-busy="true" className="w-full">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** Maç ekranı: başlık şeridi, sahne ve yan panel */
export function MatchSkeleton() {
  return (
    <Wrap label="Maç yükleniyor">
      <div className="mb-5 flex items-center gap-3">
        <Skel className="h-8 w-8" />
        <Skel className="h-6 w-28" />
        <Skel className="h-6 w-36" />
        <Skel className="ml-auto h-6 w-28" />
      </div>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-2">
            <Skel className="h-12" /><Skel className="h-12" /><Skel className="h-12" />
          </div>
          <Skel className="aspect-[16/10] w-full" />
          <Skel className="h-10 w-2/3 self-center" />
          <Skel className="h-14 w-full" />
        </div>
        <div className="flex flex-col gap-3">
          <Skel className="h-9 w-full" />
          <Skel className="h-28 w-full" />
          <Skel className="h-28 w-full" />
          <Skel className="h-28 w-full" />
        </div>
      </div>
    </Wrap>
  );
}

/** Turnuva ağacı: iki tur sütunu */
export function BracketSkeleton() {
  return (
    <Wrap label="Turnuva yükleniyor">
      <Skel className="mb-3 h-4 w-24" />
      <Skel className="mb-2 h-9 w-56" />
      <Skel className="mb-8 h-4 w-96 max-w-full" />
      <div className="flex gap-6 overflow-hidden">
        {[2, 1].map((n, c) => (
          <div key={c} className="flex w-60 shrink-0 flex-col justify-around gap-3">
            <Skel className="h-4 w-20" />
            {Array.from({ length: n }, (_, i) => <Skel key={i} className="h-28 w-full" />)}
          </div>
        ))}
      </div>
    </Wrap>
  );
}

/** Ajan profili: kimlik şeridi ve istatistik kutuları */
export function ProfileSkeleton() {
  return (
    <Wrap label="Ajan yükleniyor">
      <Skel className="mb-6 h-4 w-28" />
      <Skel className="h-44 w-full" />
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => <Skel key={i} className="h-20" />)}
      </div>
    </Wrap>
  );
}

/** Kart ızgarası (lobi ve turnuva listesi) */
export function CardsSkeleton({ n = 4, className = "h-48" }: { n?: number; className?: string }) {
  return (
    <Wrap label="Yükleniyor">
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: n }, (_, i) => <Skel key={i} className={`${className} w-full`} />)}
      </div>
    </Wrap>
  );
}

/** Sıralama satırları */
export function RowsSkeleton({ n = 5 }: { n?: number }) {
  return (
    <Wrap label="Yükleniyor">
      <div className="flex flex-col gap-2">
        {Array.from({ length: n }, (_, i) => <Skel key={i} className="h-16 w-full" />)}
      </div>
    </Wrap>
  );
}
