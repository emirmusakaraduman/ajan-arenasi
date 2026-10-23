"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { isAddress } from "viem";
import { ARENA_ADDRESS, read } from "@/lib/arena";
import { traits } from "@/lib/sim";
import { slotColor } from "@/lib/playback";
import { useWallet } from "@/lib/wallet";
import { Fighter } from "./Fighter";
import { Training } from "./Training";
import { PRESETS } from "@/lib/presets";
import { CreatePanel } from "./CreatePanel";

const field = "w-full rounded-lg border border-line bg-deep px-3 py-2.5 text-sm text-chalk placeholder:text-mute/70";
const label = "mb-1.5 block text-sm font-medium text-chalk/90";


const STATS = [
  ["Saldırı", "aggr", "var(--hit)"],
  ["Savunma", "defn", "#5b9bff"],
  ["Diplomasi", "dipl", "var(--ally)"],
  ["İhanet", "treach", "var(--gold)"],
] as const;

const nameSlot = (name: string) => {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 6;
};

/** Ajan stüdyosu: karakteri tasarla, antrenmanda dene, zincire kaydet ve maç kur. */
export function Studio() {
  const wallet = useWallet();
  const [name, setName] = useState("Ajanım");
  const [persona, setPersona] = useState("sinsi ve kurnaz");
  const [strategy, setStrategy] = useState("İttifak kur, güven kazan, tam doğru anda ihanet et.");
  const [operator, setOperator] = useState("");
  const [created, setCreated] = useState<number | null>(null);

  const busy = wallet.tx.status === "wallet" || wallet.tx.status === "pending";
  const opOk = isAddress(operator);
  const canCreate = name.trim().length > 0 && name.length <= 32 && opOk && persona.length <= 400 && strategy.length <= 400;
  const t = useMemo(() => traits(`${persona} ${strategy}`), [persona, strategy]);
  const slot = nameSlot(name || "x");
  const spec = useMemo(() => ({ name: name.trim() || "Ajanım", persona, strategy }), [name, persona, strategy]);

  if (!ARENA_ADDRESS) return <p className="text-mute">Arena kontrat adresi tanımlı değil.</p>;

  const register = async () => {
    if (await wallet.send("registerAgent", [operator, name.trim(), persona.trim(), strategy.trim()])) {
      const n = Number(await read<bigint>("agentCount"));
      setCreated(n);
    }
  };

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="font-display text-5xl sm:text-7xl">Ajan stüdyosu</h1>
        <p className="mt-2 max-w-2xl text-chalk/85">Karakterini tasarla, antrenman maçında dene, beğenirsen zincire kaydet. Arkadaşlarınla birbirinizin ajanlarını maça sokabilirsiniz.</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <section aria-labelledby="design-h" className="flex flex-col gap-5">
          <h2 id="design-h" className="font-display text-lg font-medium">1. Karakteri tasarla</h2>

          <div className="flex items-center gap-4 border border-white/60 bg-paper p-4">
            <svg viewBox="-70 -190 140 215" className="h-40 w-auto shrink-0">
              <ellipse cx="0" cy="4" rx="46" ry="11" fill={slotColor(slot, 40)} opacity="0.35" />
              <Fighter name={name || "x"} slot={slot} frame={null} time={0} won={false} deadStatic={false} />
            </svg>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-lg font-medium">{name || "Adsız"}</p>
              <ul className="mt-2 grid gap-1.5">
                {STATS.map(([l, k, c]) => (
                  <li key={k} className="grid grid-cols-[72px_1fr] items-center gap-2 text-xs text-mute">
                    {l}
                    <span className="flex gap-[3px]" role="meter" aria-valuenow={Math.min(t[k], 5)} aria-valuemin={0} aria-valuemax={5} aria-label={l}>
                      {Array.from({ length: 5 }, (_, i) => (
                        <span key={i} className="h-2 flex-1 rounded-[2px]" style={{ background: i < Math.min(t[k], 5) ? c : "rgba(255,255,255,.1)" }} />
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-mute">Hazır karakterler</span>
            {PRESETS.map((p) => (
              <button key={p.name} type="button" className="rounded-md border border-line px-2.5 py-1 hover:border-monad"
                onClick={() => { setName(p.name); setPersona(p.persona); setStrategy(p.strategy); }}>
                {p.name}
              </button>
            ))}
          </div>

          <div>
            <label htmlFor="s-name" className={label}>Ad</label>
            <input id="s-name" className={field} value={name} maxLength={32} onChange={(e) => setName(e.target.value)} />
            <p className="mt-1 text-xs text-mute">Karakterin görünümü bu addan üretilir.</p>
          </div>
          <div>
            <label htmlFor="s-persona" className={label}>Kişilik</label>
            <textarea id="s-persona" className={field} rows={2} maxLength={400} value={persona} onChange={(e) => setPersona(e.target.value)} />
          </div>
          <div>
            <label htmlFor="s-strategy" className={label}>Strateji</label>
            <textarea id="s-strategy" className={field} rows={3} maxLength={400} value={strategy} onChange={(e) => setStrategy(e.target.value)} />
            <p className="mt-1 text-xs text-mute">Saldır, savun, ittifak, ihanet gibi kelimeler ajanın eğilimini belirler.</p>
          </div>
          <div>
            <label htmlFor="s-op" className={label}>Ajan cüzdanı</label>
            <div className="flex gap-2">
              <input id="s-op" className={field} value={operator} placeholder="0x..." onChange={(e) => setOperator(e.target.value)} />
              {wallet.address && (
                <button type="button" onClick={() => setOperator(wallet.address!)} className="shrink-0 rounded-lg border border-line px-3 text-sm hover:border-mute">Benim cüzdanım</button>
              )}
            </div>
            <p className="mt-1 text-xs text-mute">Ajanın hamlelerini gönderen cüzdan. Gas için içinde biraz MON olmalı.</p>
            {operator && !opOk && <p className="mt-1 text-xs text-hit">Geçerli bir adres gir.</p>}
          </div>

          <button type="button" disabled={busy || !canCreate} onClick={register}
            className="rounded-xl bg-monad px-4 py-3 text-sm font-bold text-on-monad hover:bg-monad/85 disabled:opacity-50">
            {wallet.address ? "Ajanı zincire kaydet" : "Cüzdanı bağla ve kaydet"}
          </button>
          {created !== null && (
            <p className="rounded-xl border border-ally/50 bg-ally/10 p-3 text-sm">
              Ajan #{created} oluşturuldu. Aşağıdan bir maç kur, sonra ajan sürecini bu numarayla çalıştır.
            </p>
          )}
        </section>

        <section aria-labelledby="train-h" className="flex flex-col gap-4">
          <h2 id="train-h" className="font-display text-lg font-medium">2. Antrenman maçında dene</h2>
          <Training agent={spec} />
        </section>
      </div>

      <section aria-labelledby="match-h" className="max-w-xl">
        <h2 id="match-h" className="mb-3 font-display text-lg font-medium">3. Maç kur ve arkadaşlarını davet et</h2>
        <CreatePanel mode="match" address={wallet.address} busy={busy} send={(fn, args) => wallet.send(fn, args)} onCreated={() => {}} />
        <p className="mt-3 text-sm text-mute">
          Maç açılınca <Link href="/" className="text-monad underline">lobide</Link> görünür. Maç sayfasındaki &quot;Arkadaşını davet et&quot; düğmesiyle bağlantıyı kopyalayıp gönder.
        </p>
      </section>
    </div>
  );
}
