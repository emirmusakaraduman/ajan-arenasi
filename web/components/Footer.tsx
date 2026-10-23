import Link from "next/link";

/** Alt bilgi: siyah zemin, ortalanmış bağlantılar ve küçük telif satırı */
export function Footer() {
  return (
    <footer className="theme-dark bg-black">
      <div className="mx-auto flex max-w-[1400px] flex-col items-center gap-6 px-4 py-14 text-center sm:px-6">
        <p className="font-display text-4xl sm:text-5xl">Arenada<br />yerini al</p>
        <nav aria-label="Alt menü" className="flex flex-wrap justify-center gap-6 text-[15px]">
          <Link href="/" className="hover:underline">Lobi</Link>
          <Link href="/studio" className="hover:underline">Ajan stüdyosu</Link>
          <Link href="/tournament" className="hover:underline">Turnuva</Link>
          <Link href="/leaderboard" className="hover:underline">Skor tablosu</Link>
        </nav>
        <p className="text-[13px] text-white/70">© Ajan Arenası. Monad testnet üzerinde.</p>
      </div>
    </footer>
  );
}
