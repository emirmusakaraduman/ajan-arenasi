import { config } from "dotenv";
config({ path: new URL("../../.env", import.meta.url) });
config();
import { createPublicClient, createWalletClient, defineChain, encodeAbiParameters, http, keccak256, toHex } from "viem";
import { randomBytes } from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { decide, speak, type Chat, type Observation } from "./brain.js";
import { analyze, MemoryStore, type Mv } from "./memory.js";

/**
 * Kullanım:
 *   npm run watch            → izleme modu: açık kalır, bizim ajanlarımızın olduğu her maçı kendisi bulur,
 *                              bahis bitince başlatır ve maç bitene kadar oynatır
 *   npm run run -- <matchId> → yalnızca o maçı oynatır ve çıkar
 * Her ajan kendi operatör anahtarıyla hamle gönderir; başlatma ve tur çözümü izinsizdir, bu süreç çağırır.
 */
const abi = JSON.parse(
  readFileSync(new URL("../../artifacts/contracts/Arena.sol/Arena.json", import.meta.url), "utf8"),
).abi;

const monadTestnet = defineChain({
  id: Number(process.env.CHAIN_ID ?? 10143), // yerelde 31337
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [process.env.RPC_URL ?? process.env.MONAD_TESTNET_RPC ?? "https://testnet-rpc.monad.xyz"] } },
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
});

const arena = process.env.ARENA_ADDRESS as `0x${string}`;
const arg = process.argv[2] ?? "watch";
if (!arena) throw new Error("ARENA_ADDRESS tanımlı değil");

// AGENT_KEYS="1:0xpk,2:0xpk" ya da AGENT_IDS="4,5,6" + .env'deki OPERATOR_PK_1..3.
// İkisi de verilmezse her ajanın anahtarı, zincirdeki operatör adresine göre OPERATOR_PK_1..3 arasından bulunur.
const idKeys = (process.env.AGENT_IDS ?? "")
  .split(",")
  .filter(Boolean)
  .map((id, i) => `${id}:${process.env[`OPERATOR_PK_${i + 1}`]}`)
  .join(",");
const keys: Record<string, `0x${string}`> = Object.fromEntries(
  (process.env.AGENT_KEYS || idKeys).split(",").filter(Boolean).map((kv) => {
    const [id, pk] = kv.split(":");
    return [id, pk as `0x${string}`];
  }),
);
const pool = [1, 2, 3].map((i) => process.env[`OPERATOR_PK_${i}`]).filter(Boolean) as `0x${string}`[];
const anyKey = (Object.values(keys)[0] ?? pool[0]) as `0x${string}` | undefined;
if (!anyKey) throw new Error("Operatör anahtarı yok: .env içine OPERATOR_PK_1..3 ya da AGENT_KEYS ekle");

// Herkese açık RPC saniyede 15 istekle sınırlı: aynı anda yapılan okumalar tek bir multicall3 çağrısında toplanır,
// hata gelirse bekleyip yeniden denenir. Yerel zincirde (31337) multicall3 yoktur.
const transport = http(undefined, { retryCount: 10, retryDelay: 800 });
const pub = createPublicClient({
  chain: monadTestnet,
  transport,
  batch: monadTestnet.id === 10143 ? { multicall: { wait: 40 } } : undefined,
  pollingInterval: Number(process.env.POLL_MS ?? 1500), // makbuz yoklama aralığı (ms); herkese açık RPC için 1500, yerel zincirde düşürülebilir
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** RUNNER_DEBUG=1 ile açılan ayrıntılı günlük (takılma ve gecikme teşhisi için) */
const debug = (...a: unknown[]) => { if (process.env.RUNNER_DEBUG) console.log("  [debug " + new Date().toISOString().slice(11, 19) + "]", ...a); };
const nowSec = () => Math.floor(Date.now() / 1000);
const read = (fn: string, args: unknown[] = []) =>
  pub.readContract({ address: arena, abi, functionName: fn, args }) as Promise<any>;

// Aynı operatör birden çok ajanı (ve maçı) yönetebilir: aynı anahtardan giden işlemler sıraya girer, nonce çakışmaz
const queues = new Map<string, Promise<unknown>>();
/** Kontrat reddi (revert) kalıcıdır, yeniden denemek anlamsız; ağ/nonce/zaman aşımı hataları geçicidir */
const isRevert = (e: any) => /revert/i.test(`${e?.name ?? ""} ${e?.shortMessage ?? e?.message ?? ""}`);
const SEND_ATTEMPTS = 3;
function send(pk: `0x${string}`, fn: string, args: unknown[]) {
  const run = async () => {
    const account = privateKeyToAccount(pk);
    const wallet = createWalletClient({ account, chain: monadTestnet, transport });
    for (let attempt = 1; ; attempt++) {
      try {
        debug(`${fn} gönderiliyor (deneme ${attempt})`);
        const hash = await wallet.writeContract({ address: arena, abi, functionName: fn, args });
        debug(`${fn} gönderildi ${hash.slice(0, 12)}…, makbuz bekleniyor`);
        const rc = await pub.waitForTransactionReceipt({ hash, timeout: 90_000 });
        debug(`${fn} makbuzu: ${rc.status}`);
        // zincire giren ama revert olan işlem hata fırlatmaz; durumunu açıkça kontrol et
        if (rc.status !== "success") throw new Error(`${fn} işlemi zincirde revert oldu`);
        return;
      } catch (e) {
        if (attempt >= SEND_ATTEMPTS || isRevert(e)) throw e;
        await sleep(1000 * attempt);
      }
    }
  };
  const next = (queues.get(pk) ?? Promise.resolve()).catch(() => {}).then(run);
  queues.set(pk, next);
  return next;
}
/** Başkası (site düğmesi ya da başka süreç) önce davranmış olabilir: bu durumda hata yutulur */
const QUIET = new Set(["startMatch", "resolveRound"]); // bunların reddedilmesi olağan: başkası önce çağırmıştır
const trySend = (pk: `0x${string}`, fn: string, args: unknown[]) =>
  send(pk, fn, args).then(
    () => true,
    (e: any) => {
      if (!QUIET.has(fn)) console.warn(`  ${fn} gönderilemedi: ${e?.shortMessage ?? e?.message ?? e}${e?.cause?.data?.errorName ? ` [${e.cause.data.errorName}]` : e?.cause?.reason ? ` [${e.cause.reason}]` : ""}`);
      return false;
    },
  );

// Hamle açma verisi (salt) diske yazılır: süreç taahhütten sonra çökerse yeniden açıldığında hamle yine açılabilsin.
// Aksi halde o ajan o tur savunmasız kalırdı. Dosya gizli veri içerir, .gitignore'dadır.
type Pending = { action: number; target: number; salt: `0x${string}`; hash: `0x${string}` };
const stateDir = fileURLToPath(new URL("../.state/", import.meta.url));
const stateFile = `${stateDir}pending-${arena.toLowerCase()}.json`;
const pendingKey = (matchId: bigint, round: number, slot: number) => `${matchId}:${round}:${slot}`;
function loadPending(): Record<string, Pending> {
  try { return existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, "utf8")) : {}; } catch { return {}; }
}
const pendingStore = loadPending();
function savePending() {
  mkdirSync(stateDir, { recursive: true });
  const tmp = `${stateFile}.tmp`;
  writeFileSync(tmp, JSON.stringify(pendingStore));
  renameSync(tmp, stateFile); // yarım yazılmış dosya kalmasın
}
function rememberPending(matchId: bigint, round: number, slot: number, p: Pending) {
  pendingStore[pendingKey(matchId, round, slot)] = p;
  savePending();
}
function forgetMatch(matchId: bigint) {
  const drop = Object.keys(pendingStore).filter((k) => k.startsWith(`${matchId}:`));
  if (!drop.length) return;
  for (const k of drop) delete pendingStore[k];
  savePending();
}

/** Maçtaki ajanlardan anahtarı bizde olanlar (zincirdeki operatör adresine göre) */
function keysFor(agentIds: bigint[], agents: any[]) {
  const out: Record<string, `0x${string}`> = {};
  agentIds.forEach((id, s) => {
    if (keys[String(id)]) { out[String(id)] = keys[String(id)]; return; }
    const op = String(agents[s].operator).toLowerCase();
    const pk = pool.find((k) => privateKeyToAccount(k).address.toLowerCase() === op);
    if (pk) out[String(id)] = pk;
  });
  return out;
}

const MOVE_PAST = ["savundu", "saldırdı", "ittifak teklif etti", "çaldı", "güç topladı", "pakt kurdu"];
const MOVE_NOW = ["savun", "saldır", "ittifak", "çal", "güç topla", "pakt"];
const memory = new MemoryStore(`${stateDir}memory-${arena.toLowerCase()}.json`);

const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";

/** Maç bitince bizim ajanlarımızın hafızasına ders yazar (kim ihanet etti, kiminle ittifak işe yaradı). */
async function rememberMatch(matchId: bigint, agentIds: bigint[], agents: any[], mine: Record<string, string>, m: any) {
  const id = Number(matchId);
  if (memory.has(id)) return;
  const names = agents.map((a) => a.name as string);
  const rounds: Mv[][] = await Promise.all(
    Array.from({ length: Number(m.round) }, (_, r) =>
      Promise.all(agentIds.map((_, s) => read("getMove", [matchId, r, s]).then((x: any) => ({ action: Number(x.action), target: Number(x.target), submitted: !!x.submitted })))),
    ),
  );
  const finalHp: number[] = (await read("getHp", [matchId])).map(Number);
  const winner = Number(m.winnerSlot);
  const { lessons, facts } = analyze(names, rounds, winner, finalHp, id);
  agentIds.forEach((aid, slot) => {
    if (mine[String(aid)]) memory.record(id, Number(aid), lessons[slot], slot === winner, facts[slot]);
  });
  memory.finish(id);
}

async function playMatch(matchId: bigint) {
  const tag = `[maç ${matchId}]`;
  const agentIds: bigint[] = await read("getMatchAgents", [matchId]);
  const agents = await Promise.all(agentIds.map((id) => read("getAgent", [id])));
  const history: string[] = [];
  // Maç bayrakları değişmez: 1 = gelişmiş hamleler, 2 = arena olayları. Eski kontratta bu fonksiyon yoktur (0).
  const flags = Number(await read("matchFlags", [matchId]).catch(() => 0));
  const advanced = (flags & 1) !== 0;
  const events = (flags & 2) !== 0;
  if (flags) console.log(`${tag} kurallar: ${[advanced && "gelişmiş hamleler", events && "arena olayları"].filter(Boolean).join(" + ")}`);
  const mine = keysFor(agentIds, agents);
  const missing = agentIds.filter((id) => !mine[String(id)]);
  if (missing.length) console.warn(`${tag} anahtarı bulunamayan ajanlar (hamle yapamaz): ${missing.join(", ")}`);
  // Başlatma ve tur çözme izinsizdir: hangi anahtarın parası yetiyorsa onunla gönderilir
  const anyOf = [...new Set([...Object.values(mine), ...pool])];
  const tryAny = async (fn: string, args: unknown[]) => {
    for (const pk of anyOf) if (await send(pk, fn, args).then(() => true, () => false)) return true;
    return false;
  };

  /** Taahhüt edilmiş ama açılmamış hamleleri diskteki salt ile aç (süreç çöküp yeniden açıldığında) */
  const revealSaved = (round: number, who: { slot: number; pk: `0x${string}` }[]) =>
    Promise.all(
      who.map(async ({ slot, pk }) => {
        const p = pendingStore[pendingKey(matchId, round, slot)];
        if (!p) return;
        if ((await read("getMove", [matchId, round, slot])).submitted) return;
        if ((await read("getCommit", [matchId, round, slot])) !== p.hash) return;
        if (await trySend(pk, "revealMove", [matchId, slot, p.action, p.target, p.salt]))
          console.log(`${tag} ${agents[slot].name} kayıtlı hamlesini açtı (çökme sonrası): ${MOVE_NOW[p.action]} -> ${p.target}`);
      }),
    );

  let m = await read("getMatch", [matchId]);
  while (Number(m.phase) === 1) {
    if (BigInt(nowSec()) >= m.bettingEnd) {
      if (await tryAny("startMatch", [matchId])) console.log(`${tag} maç başlatıldı`);
      else await sleep(3000);
    } else await sleep(2000);
    m = await read("getMatch", [matchId]);
  }

  while (Number(m.phase) === 2) {
    const round = Number(m.round);
    const hp: number[] = (await read("getHp", [matchId])).map(Number);
    console.log(`\n${tag} == Tur ${round + 1} == can:`, hp.join(","));

    // Ağır saldırı hazırlayan ajan bu tur hamle vermez, kontrat kendiliğinden vurdurur
    const charged: number[] = advanced
      ? await Promise.all(agentIds.map((_, s) => read("getCharge", [matchId, s]).then(Number).catch(() => 0)))
      : agentIds.map(() => 0);
    charged.forEach((c, s) => {
      if (c && hp[s] > 0) console.log(`${tag} ${agents[s].name} ağır saldırısını ${agents[c - 1].name} üstüne indiriyor 💥`);
    });
    const playing = agentIds.map((id, slot) => ({ id, slot, pk: mine[String(id)] })).filter((x) => x.pk && hp[x.slot] > 0 && !charged[x.slot]);

    // Tura geç kalındıysa (süreç sonradan açıldı) yeni hamle gönderilemez. Ama süreç taahhütten sonra çöktüyse
    // diskteki salt ile hamle hâlâ açılabilir; sonra tur süresinin dolmasını bekleyip turu çöz
    if (nowSec() >= Number(m.commitDeadline) - 1) {
      const untilCommitEnd = Number(m.commitDeadline) - nowSec();
      if (untilCommitEnd > 0) await sleep(untilCommitEnd * 1000 + 500);
      if (nowSec() < Number(m.revealDeadline)) await revealSaved(round, playing);
      const wait = Number(m.revealDeadline) - nowSec();
      if (wait > 0) await sleep(wait * 1000 + 1500);
      if (!(await tryAny("resolveRound", [matchId]))) await sleep(3000); // çözülemediyse RPC'yi boğmadan bekle
      m = await read("getMatch", [matchId]);
      continue;
    }

    const observe = (slot: number, messages: Chat[]): Observation => ({
      round,
      mySlot: slot,
      myHp: hp[slot],
      opponents: agents.map((a, s) => ({ slot: s, name: a.name as string, hp: hp[s], charging: charged[s] ? true : undefined })).filter((o) => o.slot !== slot),
      history,
      messages,
      advanced,
      events,
      memory: memory.lines(Number(agentIds[slot])),
      facts: memory.facts(Number(agentIds[slot])),
      myName: agents[slot].name as string,
    });
    // Çökme sonrası devam: bu tur için zincirde zaten taahhüdü olan ajanlar yeniden konuşmaz ve karar vermez
    const committed = new Map<number, string>();
    await Promise.all(playing.map(async ({ slot }) => committed.set(slot, await read("getCommit", [matchId, round, slot]))));
    const hasCommit = (slot: number) => committed.get(slot) !== ZERO_HASH;

    // 1) pazarlık: herkes aynı anda herkese açık bir mesaj bırakır
    await Promise.all(
      playing.map(async ({ slot, pk }) => {
        if (hasCommit(slot)) return;
        const text = await speak(agents[slot], observe(slot, []));
        if (!text) return;
        if (await trySend(pk, "say", [matchId, slot, text])) console.log(`${tag} ${agents[slot].name} konuştu 💬 ${text}`);
      }),
    );
    const said: { slot: number; text: string }[] = await read("getMessages", [matchId, round]).catch(() => []);
    const chat: Chat[] = said.map((x) => ({ slot: Number(x.slot), name: agents[Number(x.slot)].name as string, text: x.text }));
    for (const c of chat) history.push(`Tur ${round + 1} mesaj, ${c.name}: ${c.text}`);

    // 2) mesajları okuyan ajanlar düşünür ve hamlelerini taahhüt eder (gizli)
    const reveals: (Pending & { slot: number; pk: `0x${string}` })[] = [];
    await Promise.all(
      playing.map(async ({ slot, pk }) => {
        if (hasCommit(slot)) {
          const saved = pendingStore[pendingKey(matchId, round, slot)];
          if (saved && saved.hash === committed.get(slot)) {
            reveals.push({ slot, pk, ...saved });
            console.log(`${tag} ${agents[slot].name} önceki taahhüdü devralındı (süreç yeniden başlamış)`);
          } else {
            console.warn(`${tag} ${agents[slot].name} bu tur taahhüt etmiş ama salt kayıtlı değil, hamlesi açılamaz`);
          }
          return;
        }
        const d = await decide(agents[slot], observe(slot, chat));
        const salt = toHex(randomBytes(32));
        const hash = keccak256(
          encodeAbiParameters(
            [{ type: "uint256" }, { type: "uint8" }, { type: "uint8" }, { type: "uint8" }, { type: "uint8" }, { type: "bytes32" }],
            [matchId, round, slot, d.action, d.target, salt],
          ),
        );
        // salt, işlem gönderilmeden önce diske yazılır: işlem zincire girip süreç çökerse hamle kaybolmasın
        rememberPending(matchId, round, slot, { action: d.action, target: d.target, salt, hash });
        // işlem gönderimi hata verse bile zincire girmiş olabilir (zaman aşımı): taahhüdü zincirden doğrula
        if (!(await trySend(pk, "commitMove", [matchId, slot, hash])) && (await read("getCommit", [matchId, round, slot])) !== hash) return;
        reveals.push({ slot, pk, action: d.action, target: d.target, salt, hash });
        console.log(`${tag} ${agents[slot].name} hamlesini kilitledi 🔒 | ${d.reason}`);
        history.push(`Tur ${round + 1}: ${agents[slot].name} ${MOVE_PAST[d.action]} (hedef ${d.target})`);
      }),
    );

    // 3) herkes taahhüt edene ya da commit süresi bitene kadar bekle
    debug("adım 3: commit penceresi bekleniyor");
    while (!(await read("allCommitted", [matchId]))) {
      if (nowSec() >= Number((await read("getMatch", [matchId])).commitDeadline)) break;
      await sleep(1500);
    }
    const mm = await read("getMatch", [matchId]);
    const wait = Number(mm.commitDeadline) - nowSec();
    if (!(await read("allCommitted", [matchId])) && wait > 0) await sleep(wait * 1000 + 1500);

    // 4) hamleleri aç
    debug(`adım 4: ${reveals.length} hamle açılacak`);
    await Promise.all(
      reveals.map(async (r) => {
        const opened = (await trySend(r.pk, "revealMove", [matchId, r.slot, r.action, r.target, r.salt])) || (await read("getMove", [matchId, round, r.slot])).submitted;
        if (opened)
          console.log(`${tag} ${agents[r.slot].name}: ${MOVE_NOW[r.action]} -> ${r.target}`);
      }),
    );

    // 5) herkes açtıysa hemen, açmayan varsa reveal süresi dolunca turu çöz
    if (!(await tryAny("resolveRound", [matchId]))) {
      const left = Number((await read("getMatch", [matchId])).revealDeadline) - nowSec();
      if (left > 0) await sleep(left * 1000 + 1500);
      await tryAny("resolveRound", [matchId]);
    }
    m = await read("getMatch", [matchId]);
  }

  forgetMatch(matchId);
  await rememberMatch(matchId, agentIds, agents, mine, m).catch((e) => console.warn(`${tag} hafıza yazılamadı: ${e?.message ?? e}`));
  const w = agents[Number(m.winnerSlot)];
  console.log(`\n${tag} Kazanan: ${w.name} (slot ${m.winnerSlot})`);
}

/** İzleme modu: birkaç saniyede bir açık maçlara bakar; bizim ajanımızın olduğu ve oynatılmayan maçı devralır */
async function watch() {
  const active = new Set<string>();
  const done = new Set<string>(); // bitmiş maçlar bir daha sorgulanmaz
  const retryAt = new Map<string, number>(); // hata veren maç, bekleme süresi dolana kadar yeniden devralınmaz
  const failures = new Map<string, number>();
  console.log("İzleme modu açık: maçlar kendiliğinden başlatılıp oynatılacak. Kapatmak için Ctrl+C.");
  for (;;) {
    try {
      const count = Number(await read("matchCount"));
      for (let i = 1; i <= count; i++) {
        const id = BigInt(i);
        if (active.has(String(id)) || done.has(String(id))) continue;
        if (Date.now() < (retryAt.get(String(id)) ?? 0)) continue;
        const m = await read("getMatch", [id]);
        if (Number(m.phase) === 3) { done.add(String(id)); continue; }
        const agentIds: bigint[] = await read("getMatchAgents", [id]);
        const agents = await Promise.all(agentIds.map((a) => read("getAgent", [a])));
        if (Object.keys(keysFor(agentIds, agents)).length === 0) continue;
        active.add(String(id));
        console.log(`[maç ${id}] devralındı: ${agents.map((a) => a.name).join(", ")}`);
        playMatch(id)
          .then(() => failures.delete(String(id)))
          .catch((e) => {
            // art arda hatalarda bekleme 10 sn'den başlayıp en fazla 2 dakikaya çıkar; RPC boğulmaz
            const n = (failures.get(String(id)) ?? 0) + 1;
            failures.set(String(id), n);
            const delay = Math.min(10_000 * 2 ** (n - 1), 120_000);
            retryAt.set(String(id), Date.now() + delay);
            console.error(`[maç ${id}] hata (${n}. kez, ${Math.round(delay / 1000)} sn sonra yeniden denenecek):`, e?.shortMessage ?? e?.message ?? e, e?.details ?? "");
          })
          .finally(() => active.delete(String(id)));
      }
    } catch (e: any) {
      console.error("izleme hatası:", e?.shortMessage ?? e?.message ?? e, e?.details ?? "");
    }
    await sleep(8000);
  }
}

// Kapanış: bekleyen işlem yarım kalmasın diye sinyalde nazikçe çık. Salt'lar zaten her taahhütten önce diske yazılıyor.
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    console.log(`
${sig} alındı, kapanıyor. Bekleyen hamleler yeniden açıldığında diskteki kayıttan devam eder.`);
    process.exit(0);
  });
}
// Beklenmeyen bir söz reddi tüm süreci düşürmesin (izleme modunda yeniden denenir)
process.on("unhandledRejection", (e: any) => console.error("yakalanmamış hata:", e?.shortMessage ?? e?.message ?? e));

(arg === "watch" ? watch() : playMatch(BigInt(arg))).catch((e) => {
  console.error(e);
  process.exit(1);
});
