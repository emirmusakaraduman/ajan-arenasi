"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useWallet } from "@/lib/wallet";
import { isMuted, isMusicOn, setMuted, startMusic, stopMusic, play } from "@/lib/sfx";

const LINKS = [
  { href: "/", label: "Lobi" },
  { href: "/studio", label: "Stüdyo" },
  { href: "/tournament", label: "Turnuva" },
  { href: "/leaderboard", label: "Skorlar" },
];

/** Beyaz menü yazıları; seçili sayfanın üstünde kalın beyaz çizgi */
function NavLinks({ active }: { active: boolean }) {
  const path = active ? usePathname() : ""; // eslint-disable-line react-hooks/rules-of-hooks
  return (
    <nav aria-label="Ana menü" className="flex gap-6">
      {LINKS.map((l) => {
        const on = l.href === "/" ? path === "/" || path.startsWith("/match") : path.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} aria-current={on ? "page" : undefined}
            className={`border-t-[3px] pt-2 text-[15px] transition-colors ${on ? "border-white text-white" : "border-transparent text-white/80 hover:text-white"}`}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Monad işareti: köşeleri yuvarlatılmış, ortası boş eşkenar dörtgen (beyaz) */
function Logo() {
  return (
    <svg viewBox="0 0 100 100" className="h-10 w-10" aria-hidden>
      <path
        fill="#ffffff"
        fillRule="evenodd"
        d="M50 4C37 4 4 37 4 50s33 46 46 46 46-33 46-46S63 4 50 4Zm0 20c-7 0-26 19-26 26s19 26 26 26 26-19 26-26-19-26-26-26Z"
      />
    </svg>
  );
}

export function Header() {
  const wallet = useWallet();
  const [muted, setMutedState] = useState(false);
  const [music, setMusic] = useState(false);

  useEffect(() => {
    // Ses tercihi localStorage'dan yalnızca tarayıcıda okunabilir (hidrasyon uyuşmazlığı olmasın diye efekt içinde)
    /* eslint-disable react-hooks/set-state-in-effect */
    setMutedState(isMuted());
    const on = isMusicOn();
    setMusic(on);
    /* eslint-enable react-hooks/set-state-in-effect */
    if (on) startMusic(); // tarayıcı ilk tıklamaya kadar sesi tutar, tıklayınca başlar
  }, []);

  const quiet = "text-[13px] text-white/75 hover:text-white";
  return (
    <header className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4 sm:px-6">
      <Link href="/" className="flex items-center gap-3 text-[22px] font-extrabold tracking-[-0.03em] text-white">
        <Logo />
        Ajan Arenası
      </Link>
      <div className="ml-auto flex flex-wrap items-center gap-x-6 gap-y-2">
        <Suspense fallback={<NavLinks active={false} />}>
          <NavLinks active />
        </Suspense>
        <button type="button" aria-pressed={music} className={quiet} onClick={() => { if (music) stopMusic(); else startMusic(); setMusic(!music); }}>
          {music ? "Müzik açık" : "Müzik kapalı"}
        </button>
        <button type="button" aria-pressed={!muted} className={quiet} onClick={() => { setMuted(!muted); setMutedState(!muted); if (muted) play("tick"); }}>
          {muted ? "Efekt kapalı" : "Efekt açık"}
        </button>
        {wallet.address ? (
          <span className="border border-white px-3 py-1.5 text-[13px]" title={wallet.address}>
            {wallet.address.slice(0, 6)}…{wallet.address.slice(-4)}
          </span>
        ) : (
          <button type="button" onClick={() => wallet.connect()} className="bg-white px-4 py-1.5 text-[13px] text-black hover:bg-white/85">
            Cüzdanı bağla
          </button>
        )}
      </div>
    </header>
  );
}
