import type { RoundLog } from "./replay";

const PRIORITY = ["betrayal", "eliminated", "attack", "steal", "alliance", "pact", "blocked", "charge", "offer", "trap", "spring", "defend", "idle"];

/** Sunucu: turun en önemli olayını renkli bir cümleye çevirir. Seçim tur numarasına bağlıdır, aynı tur aynı cümleyi verir. */
export function commentary(log: RoundLog, names: string[]): string {
  const pick = <T,>(arr: T[]) => arr[(log.round * 7 + log.events.length) % arr.length];
  const top = [...log.events].sort((a, b) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind))[0];
  if (!top) return "Arena sessiz. Herkes bir sonraki hamleyi kolluyor.";
  const a = names[top.from] ?? "", b = top.to !== undefined ? names[top.to] ?? "" : "";
  const out = log.events.find((e) => e.kind === "eliminated");
  let line: string;
  switch (top.kind) {
    case "betrayal":
      line = pick([
        `İnanılmaz! ${a}, güvenen ${b} adlı ajanı sırtından vurdu!`,
        `İhanet! ${b} elini uzatmıştı, ${a} kılıcı çekti!`,
        `Kan donduran bir hamle: ${a} saldırdı, ${b} ise ittifak bekliyordu!`,
      ]);
      break;
    case "steal":
      line = pick([`${a} cebi karıştırdı, ${b} bir can eksildi!`, `Hırsızlık! ${a}, ${b} ajanından can çaldı.`]);
      break;
    case "charge":
      line = pick([`${a} güç topluyor... Bir sonraki tur kimin başına patlayacak?`, `${a} kılıcını kaldırdı, ağır bir darbe geliyor!`]);
      break;
    case "pact":
      line = pick([`Üçlü pakt! Hepsi birbirine güveniyor, ya biri sözünü tutmazsa?`, `Toplu ittifak kuruldu. Arenada nadir görülen bir uyum.`]);
      break;
    case "trap":
      line = pick([`Arena tuzağı! ${a} ayağını yanlış yere bastı.`, `Zemin açıldı, ${a} bir can kaybetti!`]);
      break;
    case "spring":
      line = pick([`Şifa pınarı! ${a} biraz nefes aldı.`, `Arena ${a} ajanına gülümsedi: bir can kazandı.`]);
      break;
    case "attack":
      if (top.heavy) {
        line = pick([`Ağır darbe! ${a} topladığı gücü ${b} üstüne boşalttı!`, `${b} sarsıldı, bu saldırı hazırlıklıydı!`]);
        break;
      }
      line = pick([`${a} hiç acımadı, ${b} sarsıldı!`, `Sert bir darbe! ${b} can kaybetti.`, `${a} atıldı, ${b} ne olduğunu anlamadı!`]);
      break;
    case "blocked":
      line = pick([`${b} kalkanını tam zamanında kaldırdı!`, `${a} boşa savurdu, ${b} sapasağlam.`]);
      break;
    case "alliance":
      line = pick([`${a} ve ${b} anlaştı. Ne kadar sürecek, bakalım.`, `Bir el sıkışma! ${a} ile ${b} birbirine güveniyor.`]);
      break;
    case "offer":
      line = `${a} elini uzattı ama ${b} karşılık vermedi.`;
      break;
    case "eliminated":
      line = `${a} arenaya veda etti.`;
      break;
    case "idle":
      line = `${a} hamlesini açmadı, bu pahalıya patlayabilir.`;
      break;
    default:
      line = "Bu tur herkes çekingen. Gerilim yükseliyor.";
  }
  return out && top.kind !== "eliminated" ? `${line} ${names[out.from]} arenaya veda etti.` : line;
}
