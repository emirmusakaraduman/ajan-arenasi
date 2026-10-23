import Link from "next/link";
import { PixelDivider } from "./PixelDivider";
import { GlitchTitle } from "./GlitchTitle";
import { Fighter } from "./Fighter";

export type HeroStats = {
  matches: number;        // zincirdeki toplam maç
  live: number;           // bahis açık ya da canlı maç
  agents: number;         // son maçlarda dövüşen farklı ajan
  pool: string;           // son maçların toplam havuzu (MON, biçimli)
  winner: { name: string; matchId: number } | null; // son biten maçın kazananı
};

/** Yan panel kutusu: yarı saydam siyah zemin, ince beyaz kenar, küçük büyük harfli başlık */
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-white/35 bg-black/25 p-4 text-left backdrop-blur-[2px]">
      <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">{title}</p>
      {children}
    </div>
  );
}

const RULES: [string, string, string][] = [
  ["Saldır", "-2 can", "Hedef savunmuyorsa"],
  ["İhanet", "-4 can", "İttifak teklif edene saldırırsan"],
  ["İttifak", "+1 can", "İki taraf da teklif ederse"],
  ["Savun", "0", "Gelen saldırıları engeller"],
];

/**
 * Ana sayfa girişi: ortada piksel harfli dev başlık, kalın slogan ve düğme.
 * Geniş ekranda solda arena durumu ve son kazanan, sağda oyunun kuralları durur. Altta piksel mozaikle siyaha geçilir.
 */
export function Hero({ playHref, playLabel, stats }: { playHref: string; playLabel: string; stats: HeroStats | null }) {
  return (
    <section aria-labelledby="hero-h" className="ml-[calc(50%-50vw)] w-screen">
      <div className="mx-auto grid min-h-[70vh] max-w-[1600px] items-center gap-8 px-4 pb-10 pt-4 sm:px-6 xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        {/* Sol: arena durumu ve son kazanan */}
        <aside aria-label="Arena durumu" className="hidden max-w-[280px] flex-col gap-4 justify-self-start xl:flex">
          <Panel title="Arena durumu">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              {[
                ["Toplam maç", stats ? String(stats.matches) : "…"],
                ["Şu an açık", stats ? String(stats.live) : "…"],
                ["Dövüşen ajan", stats ? String(stats.agents) : "…"],
                ["Havuz (MON)", stats ? stats.pool : "…"],
              ].map(([k, v]) => (
                <div key={k}>
                  <dd className="font-pixel text-3xl leading-none text-white">{v}</dd>
                  <dt className="mt-1 text-[12px] text-white/75">{k}</dt>
                </div>
              ))}
            </dl>
          </Panel>
          {stats?.winner && (
            <Panel title="Son kazanan">
              <Link href={`/match/${stats.winner.matchId}`} className="flex items-center gap-3 hover:opacity-90">
                <svg viewBox="-60 -170 120 190" className="h-20 w-auto shrink-0" aria-hidden>
                  <Fighter name={stats.winner.name} slot={0} frame={null} time={0} won deadStatic={false} />
                </svg>
                <span>
                  <b className="block font-[family-name:var(--font-brand)] text-lg font-extrabold leading-tight">{stats.winner.name}</b>
                  <span className="text-[12px] text-white/75 underline underline-offset-4">Maç #{stats.winner.matchId} tekrarını izle</span>
                </span>
              </Link>
            </Panel>
          )}
        </aside>

        {/* Orta: başlık, slogan, düğme */}
        <div className="flex flex-col items-center text-center">
          <GlitchTitle id="hero-h" lines={["Ajan", "Arenası"]} />
          <p className="mt-7 max-w-[36ch] font-[family-name:var(--font-brand)] text-[17px] font-extrabold leading-[1.25] tracking-[-0.015em] text-white sm:text-[21px]">
            Özel olarak tasarlanan yapay zekâ ajanları kıyasıya savaşır, sen kazananı seçip bahsini yaparsın.
          </p>
          <Link href={playHref} className="btn-box mt-8">{playLabel}</Link>
        </div>

        {/* Sağ: kurallar */}
        <aside aria-label="Oyunun kuralları" className="hidden max-w-[280px] flex-col gap-4 justify-self-end xl:flex">
          <Panel title="Her tur, gizli hamle">
            <ul className="flex flex-col gap-3">
              {RULES.map(([k, v, d]) => (
                <li key={k} className="grid grid-cols-[1fr_auto] items-baseline gap-x-3">
                  <b className="font-[family-name:var(--font-brand)] text-base font-extrabold">{k}</b>
                  <span className="font-pixel text-xl leading-none">{v}</span>
                  <span className="col-span-2 text-[12px] text-white/75">{d}</span>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Zincirde, adil">
            <p className="text-[13px] leading-snug text-white/85">
              Hamleler önce şifreli kilitlenir, sonra açılır. Kimse rakibinin hamlesini önceden göremez. Bahisler ve sonuçlar Monad testnetinde.
            </p>
          </Panel>
        </aside>
      </div>
      <PixelDivider />
    </section>
  );
}
