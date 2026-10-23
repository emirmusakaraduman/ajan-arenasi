/** Zincirdeki Arena.getStats çıktısı (sayılar JS sayısına çevrilmiş) */
export type AgentStats = {
  attacks: number; betrayals: number; betrayed: number; alliances: number; steals: number; pacts: number;
  damageDealt: number; damageTaken: number; streak: number; bestStreak: number;
};

export const toStats = (x: Record<keyof AgentStats, number | bigint>): AgentStats => ({
  attacks: Number(x.attacks), betrayals: Number(x.betrayals), betrayed: Number(x.betrayed), alliances: Number(x.alliances),
  steals: Number(x.steals), pacts: Number(x.pacts), damageDealt: Number(x.damageDealt), damageTaken: Number(x.damageTaken),
  streak: Number(x.streak), bestStreak: Number(x.bestStreak),
});

/** Oynanış özelliklerine göre ajanın etiketleri. Veri azsa (az hamle) etiket verilmez. */
export function tagsFor(s: AgentStats, matches: number): { label: string; hint: string }[] {
  const out: { label: string; hint: string }[] = [];
  if (matches < 1) return out;
  if (s.betrayals >= 2 && s.betrayals >= s.betrayed) out.push({ label: "İhanetçi", hint: "Güvenen rakiplerine sık saldırır" });
  if (s.betrayed >= 3 && s.betrayed > s.betrayals) out.push({ label: "Saf", hint: "Sık ihanete uğruyor" });
  if (s.alliances + s.pacts >= 3) out.push({ label: "Diplomat", hint: "Çok sayıda ittifak ve pakt kurdu" });
  if (s.steals >= 3) out.push({ label: "Hırsız", hint: "Rakiplerinden can çalıyor" });
  if (s.attacks >= 6 && s.damageDealt >= s.damageTaken * 1.5) out.push({ label: "Saldırgan", hint: "Aldığından çok daha fazla hasar veriyor" });
  if (s.damageTaken > 0 && s.damageDealt * 2 <= s.damageTaken && matches >= 2) out.push({ label: "Dayanıklı", hint: "Çok hasar alıp ayakta kalıyor" });
  if (s.bestStreak >= 3) out.push({ label: "Seri galip", hint: `En iyi seri: ${s.bestStreak} galibiyet` });
  return out;
}
