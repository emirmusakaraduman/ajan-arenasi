"use client";

import { useCallback, useEffect, useState } from "react";
import { isAddress } from "viem";
import { FLAG_ADVANCED, FLAG_EVENTS, read } from "@/lib/arena";
import type { Agent } from "@/lib/useMatch";
import { PRESETS, isPreset } from "@/lib/presets";
import { toAgent, type RawAgent } from "@/lib/rawTypes";

/** Zincirdeki tüm ajanları okur */
async function fetchAgents(): Promise<Agent[]> {
  const n = Number(await read<bigint>("agentCount"));
  const list = await Promise.all(Array.from({ length: n }, (_, i) => read<RawAgent>("getAgent", [BigInt(i + 1)])));
  return list.map(toAgent);
}

type Props = {
  mode?: "both" | "match"; // "match": yalnızca maç kurma formu (ajan formu stüdyoda)
  address: string | null;
  busy: boolean;
  send: (fn: string, args: unknown[]) => Promise<string | null>;
  onCreated: () => void;
};

const field = "w-full rounded-md border border-line bg-deep px-3 py-2 text-sm text-chalk placeholder:text-mute/70";
const label = "mb-1 block text-sm text-mute";


export function CreatePanel({ mode = "both", address, busy, send, onCreated }: Props) {
  const [name, setName] = useState("");
  const [persona, setPersona] = useState("");
  const [strategy, setStrategy] = useState("");
  const [operator, setOperator] = useState("");
  const [all, setAll] = useState<Agent[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [bettingSeconds, setBettingSeconds] = useState("120");
  const [roundSeconds, setRoundSeconds] = useState("10");
  const [maxRounds, setMaxRounds] = useState("8");
  const [advanced, setAdvanced] = useState(false); // çalma, ağır saldırı, toplu ittifak
  const [events, setEvents] = useState(false);     // rastgele arena olayları

  const loadAgents = useCallback(async () => setAll(await fetchAgents()), []);
  useEffect(() => {
    let stop = false;
    fetchAgents().then((l) => { if (!stop) setAll(l); }).catch(() => {});
    return () => { stop = true; };
  }, []);

  const opOk = isAddress(operator);
  const canCreate = name.trim().length > 0 && name.length <= 32 && opOk && persona.length <= 400 && strategy.length <= 400;
  const canMatch = picked.length >= 2 && picked.length <= 6;

  return (
    <div className="flex flex-col gap-8">
      {mode === "both" && (
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await send("registerAgent", [operator, name.trim(), persona.trim(), strategy.trim()])) {
            setName(""); setPersona(""); setStrategy("");
            await loadAgents().catch(() => {});
            onCreated();
          }
        }}
      >
        <h3 className="font-display text-base font-medium">Ajan yarat</h3>
        <div className="flex flex-wrap gap-2 text-xs text-mute">
          Hazır karakter:
          {PRESETS.map((p) => (
            <button key={p.name} type="button" className="rounded border border-line px-2 py-0.5 text-chalk hover:border-mute"
              onClick={() => { setName(p.name); setPersona(p.persona); setStrategy(p.strategy); }}>
              {p.name}
            </button>
          ))}
        </div>
        <div>
          <label htmlFor="ag-name" className={label}>Ad</label>
          <input id="ag-name" className={field} value={name} maxLength={32} onChange={(e) => setName(e.target.value)} placeholder="Örn. Gladyatör" />
        </div>
        <div>
          <label htmlFor="ag-persona" className={label}>Kişilik</label>
          <textarea id="ag-persona" className={field} rows={2} maxLength={400} value={persona} onChange={(e) => setPersona(e.target.value)} placeholder="Nasıl biri? Örn. acımasız ve sabırsız" />
        </div>
        <div>
          <label htmlFor="ag-strategy" className={label}>Strateji</label>
          <textarea id="ag-strategy" className={field} rows={3} maxLength={400} value={strategy} onChange={(e) => setStrategy(e.target.value)} placeholder="Nasıl oynayacak? Örn. ittifak kur, doğru anda ihanet et" />
        </div>
        <div>
          <label htmlFor="ag-op" className={label}>Ajan cüzdanı</label>
          <div className="flex gap-2">
            <input id="ag-op" className={field} value={operator} onChange={(e) => setOperator(e.target.value)} placeholder="0x..." />
            {address && (
              <button type="button" onClick={() => setOperator(address)} className="shrink-0 rounded-md border border-line px-3 text-sm hover:border-mute">
                Benim cüzdanım
              </button>
            )}
          </div>
          <p className="mt-1 text-xs text-mute">
            Ajanın beynini çalıştıran sürecin hamle göndereceği cüzdan. Maç başlamadan önce içinde gas için biraz MON olmalı.
          </p>
          {operator && !opOk && <p className="mt-1 text-xs text-hit">Geçerli bir adres gir.</p>}
        </div>
        <button type="submit" disabled={busy || !canCreate} className="rounded-lg bg-monad px-4 py-2.5 text-sm font-bold text-on-monad hover:bg-monad/85 disabled:opacity-50">
          {address ? "Ajanı yarat" : "Cüzdanı bağla ve ajanı yarat"}
        </button>
      </form>
      )}

      <form
        className={`flex flex-col gap-3 ${mode === "both" ? "border-t border-line pt-6" : ""}`}
        onSubmit={async (e) => {
          e.preventDefault();
          const flags = (advanced ? FLAG_ADVANCED : 0) | (events ? FLAG_EVENTS : 0);
          const base = [picked.map((p) => BigInt(p)), Number(bettingSeconds), Number(roundSeconds), Number(maxRounds)];
          // Bayrak yoksa klasik createMatch: eski kontratlarla da çalışır
          if (await (flags ? send("createMatchWithFlags", [...base, flags]) : send("createMatch", base))) {
            setPicked([]);
            onCreated();
          }
        }}
      >
        <h3 className="font-display text-base font-medium">Maç aç</h3>
        {!all.some((a) => isPreset(a.name)) ? (
          <p className="text-sm text-mute">Henüz ajan yok. Önce yukarıdan bir ajan yarat.</p>
        ) : (
          <fieldset>
            <legend className={label}>2 ile 6 arasında ajan seç</legend>
            <div className="flex flex-wrap gap-2">
              {all.map((a, i) => ({ a, id: i + 1 })).filter(({ a }) => isPreset(a.name)).map(({ a, id }) => {
                const on = picked.includes(id);
                return (
                  <label key={id} className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm ${on ? "border-monad bg-monad/20" : "border-line hover:border-mute"}`}>
                    <input type="checkbox" className="sr-only" checked={on} onChange={() => setPicked(on ? picked.filter((p) => p !== id) : [...picked, id])} />
                    {a.name}
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label htmlFor="m-bet" className={label}>Bahis (sn)</label>
            <input id="m-bet" inputMode="numeric" className={field} value={bettingSeconds} onChange={(e) => setBettingSeconds(e.target.value)} />
          </div>
          <div>
            <label htmlFor="m-round" className={label}>Hamle (sn)</label>
            <input id="m-round" inputMode="numeric" className={field} value={roundSeconds} onChange={(e) => setRoundSeconds(e.target.value)} />
          </div>
          <div>
            <label htmlFor="m-max" className={label}>Tur sayısı</label>
            <input id="m-max" inputMode="numeric" className={field} value={maxRounds} onChange={(e) => setMaxRounds(e.target.value)} />
          </div>
        </div>
        <fieldset className="flex flex-col gap-2 rounded-lg border border-line p-3">
          <legend className="px-1 text-sm text-mute">Kurallar</legend>
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} />
            <span>
              <b>Gelişmiş hamleler</b>
              <span className="block text-xs text-mute">Çal (hedeften 1 can al), Güç topla (bir tur hazırlan, sonraki tur 4 hasar), Pakt (3+ ajan birlikte +1 can).</span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={events} onChange={(e) => setEvents(e.target.checked)} />
            <span>
              <b>Arena olayları</b>
              <span className="block text-xs text-mute">Her tur sonunda rastgele tuzak (savunmayan -1 can) ya da şifa pınarı (+1 can).</span>
            </span>
          </label>
          {(advanced || events) && <p className="text-xs text-gold">Bu kurallar yalnızca yeni Arena kontratında çalışır.</p>}
        </fieldset>
        <button type="submit" disabled={busy || !canMatch} className="rounded-lg bg-monad px-4 py-2.5 text-sm font-bold text-on-monad hover:bg-monad/85 disabled:opacity-50">
          Maçı aç
        </button>
        <p className="text-xs text-mute">
          Maçlar, agents klasöründe <code className="text-chalk">npm run watch</code> açık olduğu sürece kendiliğinden başlar ve oynanır.
        </p>
      </form>
    </div>
  );
}
