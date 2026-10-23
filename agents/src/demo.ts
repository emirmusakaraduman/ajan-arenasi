import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, defineChain, formatEther, http, parseEther, type Abi, type Hex } from "viem";
import { mnemonicToAccount, type HDAccount } from "viem/accounts";

/**
 * Tek komutluk yerel demo: \`npm run demo\` (depo kökünden).
 * Yerel zinciri başlatır, Arena + Tournament'ı dağıtır, hazır karakterleri kaydeder, bir turnuva ve birkaç maç açar,
 * bahisleri doldurur, ajan runner'ını (LLM anahtarı olmadan, yedek beyinle) ve web arayüzünü başlatır.
 * Ardından demoyu canlı tutar: bitenlerin yerine yeni maç ve turnuva açar, turnuva turlarını kendisi ilerletir.
 * Kapatmak için Ctrl+C. Hiçbir gerçek anahtar kullanılmaz: Hardhat'in herkesçe bilinen test hesapları.
 */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const RPC_PORT = Number(process.env.DEMO_RPC_PORT ?? 8546);
const WEB_PORT = Number(process.env.DEMO_WEB_PORT ?? 3400);
const NO_WEB = process.env.DEMO_NO_WEB === "1";
const WEB_DEV = process.env.DEMO_DEV === "1"; // varsayılan üretim modu: sayfalar derleme beklemeden açılır
const RPC_URL = `http://127.0.0.1:${RPC_PORT}`;
const MNEMONIC = "test test test test test test test test test test test junk"; // Hardhat varsayılanı, herkes bilir: yalnızca yerel demo

const say = (m: string) => console.log(`\x1b[36m[demo]\x1b[0m ${m}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rand = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const shuffle = <T,>(a: T[]) => [...a].sort(() => Math.random() - 0.5);

const artifact = (name: string) => {
  const p = `${ROOT}artifacts/contracts/${name}.sol/${name}.json`;
  if (!existsSync(p)) throw new Error(`${p} yok. Önce derle: npx hardhat compile (npm run demo bunu kendisi yapar)`);
  const j = JSON.parse(readFileSync(p, "utf8"));
  return { abi: j.abi as Abi, bytecode: j.bytecode as Hex };
};

const chain = defineChain({ id: 31337, name: "Arena Demo", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC_URL] } } });
const pub = createPublicClient({ chain, transport: http(RPC_URL), pollingInterval: 400 });

const accounts: HDAccount[] = Array.from({ length: 8 }, (_, i) => mnemonicToAccount(MNEMONIC, { addressIndex: i }));
const keyOf = (a: HDAccount) => `0x${Buffer.from(a.getHdKey().privateKey!).toString("hex")}` as Hex;
const wallet = (a: HDAccount) => createWalletClient({ account: a, chain, transport: http(RPC_URL) });

// ---------------------------------------------------------------- süreç yönetimi

const children: { name: string; p: ChildProcess }[] = [];
let stopping = false;

/** `show`: verilirse yalnızca bu desene uyan satırlar yazılır (hardhat düğümü her RPC çağrısını yazdığı için süzülür) */
function run(name: string, cmd: string, args: string[], opts: { cwd: string; env?: Record<string, string>; show?: RegExp }) {
  const p = spawn(cmd, args, { cwd: opts.cwd, env: { ...process.env, ...opts.env }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  const tag = `\x1b[90m[${name}]\x1b[0m`;
  const pipe = (s: NodeJS.ReadableStream) => {
    let buf = "";
    s.on("data", (d: Buffer) => {
      buf += d.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? "";
      for (const l of lines) if (l.trim() && (!opts.show || opts.show.test(l))) console.log(`${tag} ${l}`);
    });
  };
  pipe(p.stdout!);
  pipe(p.stderr!);
  p.on("exit", (code) => {
    if (!stopping) console.log(`${tag} süreç çıktı (kod ${code})`);
  });
  children.push({ name, p });
  return p;
}

/** Bir süreci başlatır ve bitmesini bekler; çıkış kodunu döndürür */
function runToEnd(name: string, cmd: string, args: string[], opts: { cwd: string; env?: Record<string, string>; show?: RegExp }) {
  const p = run(name, cmd, args, opts);
  return new Promise<number>((resolve) => p.on("exit", (code) => resolve(code ?? 1)));
}

function killTree(p: ChildProcess) {
  if (!p.pid) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(p.pid), "/T", "/F"], { stdio: "ignore" });
  else p.kill("SIGTERM");
}

const tsconfigPath = `${ROOT}web/tsconfig.json`;
const tsconfigBackup = existsSync(tsconfigPath) ? readFileSync(tsconfigPath, "utf8") : null;

function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  say("kapatılıyor…");
  for (const c of children) killTree(c.p);
  // Next geliştirme sunucusu tsconfig.json'ı yeniden biçimlendirir: özgün hâline döndür
  if (tsconfigBackup !== null) try { writeFileSync(tsconfigPath, tsconfigBackup); } catch {}
  setTimeout(() => process.exit(code), 400);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
process.on("unhandledRejection", (e) => console.error("[demo] yakalanmamış hata:", (e as Error)?.message ?? e));

// ---------------------------------------------------------------- zincir işlemleri

const arenaArt = artifact("Arena");
const tourArt = artifact("Tournament");
let ARENA = "" as Hex;
let TOUR = "" as Hex;
// Aynı hesaptan işlemler sıraya girer: nonce çakışmasın
let chainLock: Promise<unknown> = Promise.resolve();
const serial = <T,>(fn: () => Promise<T>) => {
  const next = chainLock.catch(() => {}).then(fn);
  chainLock = next;
  return next;
};

const arenaRead = (fn: string, args: unknown[] = []) => pub.readContract({ address: ARENA, abi: arenaArt.abi, functionName: fn, args }) as Promise<any>;
const tourRead = (fn: string, args: unknown[] = []) => pub.readContract({ address: TOUR, abi: tourArt.abi, functionName: fn, args }) as Promise<any>;
const send = (acc: HDAccount, address: Hex, abi: Abi, functionName: string, args: unknown[], value?: bigint) =>
  serial(async () => {
    const hash = await wallet(acc).writeContract({ address, abi, functionName, args, value } as never);
    const rc = await pub.waitForTransactionReceipt({ hash });
    if (rc.status !== "success") throw new Error(`${functionName} revert oldu`);
    return rc;
  });
const arenaSend = (acc: HDAccount, fn: string, args: unknown[], value?: bigint) => send(acc, ARENA, arenaArt.abi, fn, args, value);
const tourSend = (acc: HDAccount, fn: string, args: unknown[]) => send(acc, TOUR, tourArt.abi, fn, args);

const PRESETS: [string, string, string][] = [
  ["Gladyatör", "gururlu, sabırsız, geri adım atmaz", "Her turda en zayıf rakibe saldır, savunmaya asla geçme."],
  ["Diplomat", "tatlı dilli, herkesle arası iyi", "Herkese ittifak teklif et, sana saldıranı asla unutma."],
  ["Gölge", "sessiz, hesapçı, kimseye güvenmez", "İlk iki tur savun, en çok canı olana saldır."],
  ["Yılan", "sinsi ve kurnaz", "İttifak kur, güven kazan, tam doğru anda ihanet et."],
  ["Kale", "temkinli ve sakin", "Çoğunlukla savun, can kazandıran ittifaklara gir."],
];
const AGENT_IDS = [1, 2, 3, 4, 5];

async function deploy(name: string, art: { abi: Abi; bytecode: Hex }, args: unknown[] = []) {
  const hash = await serial(() => wallet(accounts[0]).deployContract({ abi: art.abi, bytecode: art.bytecode, args } as never));
  const rc = await pub.waitForTransactionReceipt({ hash });
  say(`${name} dağıtıldı: ${rc.contractAddress}`);
  return rc.contractAddress as Hex;
}

/** Bahis süresi içinde birkaç demo hesabından rastgele bahis: oranlar dolu görünsün */
async function seedBets(matchId: bigint) {
  const slots = (await arenaRead("getMatchAgents", [matchId])).length as number;
  for (const acc of shuffle(accounts.slice(4)).slice(0, 2 + Math.floor(Math.random() * 2))) {
    try {
      await arenaSend(acc, "bet", [matchId, Math.floor(Math.random() * slots)], parseEther((0.2 + Math.random() * 1.8).toFixed(2)));
    } catch {
      return; // bahis süresi bitmiş olabilir
    }
  }
}

const FLAG_CHOICES = [0, 1, 3, 3]; // kurallar çeşitlensin: klasik, gelişmiş, gelişmiş + olaylar
const ROUND_SECONDS = 12; // 3 operatör anahtarı tüm maçları yönetir; işlemler anahtar başına sıraya girdiği için tur penceresi geniş tutulur
const MAX_OPEN = 3; // aynı anda en fazla bu kadar bitmemiş maç (turnuva eşleşmeleri dahil)

async function newMatch(bettingSeconds = 25) {
  const ids = shuffle(AGENT_IDS).slice(0, 3 + Math.floor(Math.random() * 2));
  const flags = rand(FLAG_CHOICES);
  const args = [ids.map(BigInt), bettingSeconds, ROUND_SECONDS, 6];
  await (flags ? arenaSend(accounts[0], "createMatchWithFlags", [...args, flags]) : arenaSend(accounts[0], "createMatch", args));
  const id = (await arenaRead("matchCount")) as bigint;
  say(`yeni maç #${id}: ${ids.map((i) => PRESETS[i - 1][0]).join(", ")}${flags ? ` (kurallar: ${flags})` : ""}`);
  await seedBets(id);
}

async function newTournament() {
  const ids = shuffle(AGENT_IDS).slice(0, 4);
  await tourSend(accounts[0], "createTournament", [ids.map(BigInt), 45, ROUND_SECONDS, 6, 3]);
  const tid = (await tourRead("tournamentCount")) as bigint;
  say(`yeni turnuva #${tid}: ${ids.map((i) => PRESETS[i - 1][0]).join(", ")}`);
  for (const m of (await tourRead("getRoundMatches", [tid, 0])) as bigint[]) await seedBets(m);
}

/** Bitmemiş (bahis açık ya da canlı) maç sayısı */
async function openMatchCount() {
  const n = Number(await arenaRead("matchCount"));
  let open = 0;
  for (let id = n; id >= Math.max(1, n - 8); id--) {
    if (Number((await arenaRead("getMatch", [BigInt(id)])).phase) !== 3) open++;
  }
  return open;
}

/** Turnuva turu bittiyse sonraki turu aç; bahisleri doldur */
async function advanceTournaments() {
  const n = Number(await tourRead("tournamentCount"));
  let running = 0;
  for (let tid = Math.max(1, n - 3); tid <= n; tid++) {
    const t = await tourRead("getTournament", [BigInt(tid)]);
    if (Number(t.champion) !== 0) continue;
    running++;
    const ms = (await tourRead("getRoundMatches", [BigInt(tid), Number(t.round)])) as bigint[];
    const phases = await Promise.all(ms.map(async (m) => Number((await arenaRead("getMatch", [m])).phase)));
    if (phases.every((p) => p === 3)) {
      await tourSend(accounts[0], "advance", [BigInt(tid)]);
      const after = await tourRead("getTournament", [BigInt(tid)]);
      if (Number(after.champion)) say(`turnuva #${tid} bitti, şampiyon ajan #${after.champion}`);
      else {
        say(`turnuva #${tid}: ${Number(after.round) + 1}. tur açıldı`);
        for (const m of (await tourRead("getRoundMatches", [BigInt(tid), Number(after.round)])) as bigint[]) await seedBets(m);
      }
    }
  }
  return running;
}

async function waitFor(what: string, check: () => Promise<boolean>, seconds = 60) {
  for (let i = 0; i < seconds * 2; i++) {
    try { if (await check()) return; } catch {}
    await sleep(500);
  }
  throw new Error(`${what} zamanında hazır olmadı`);
}

// ---------------------------------------------------------------- akış

async function main() {
  say("Ajan Arenası demosu başlıyor (gerçek anahtar ve LLM yok; ajanlar yedek beyinle oynar)");
  // Zincir sıfırdan başlar: önceki çalıştırmanın maç numaralı hafıza ve salt kayıtları geçersizdir
  rmSync(`${ROOT}agents/.state`, { recursive: true, force: true });

  const hardhat = `${ROOT}node_modules/hardhat/internal/cli/bootstrap.js`;
  if (!existsSync(hardhat)) throw new Error("Kökte bağımlılıklar kurulu değil: depo kökünde npm install çalıştır");
  // Gerçek zincir gibi sabit aralıkla blok: blok zamanı sistem saatiyle uyumlu kalır, tur pencereleri beklenen sürede işler
  run("zincir", process.execPath, [hardhat, "node", "--port", String(RPC_PORT)], {
    cwd: ROOT,
    env: { LOCAL_INTERVAL: "400", LOCAL_AUTOMINE: "0" },
    show: /error|revert|fail|EADDRINUSE/i,
  });
  await waitFor("yerel zincir", async () => (await pub.getChainId()) === 31337, 60);
  say(`yerel zincir hazır: ${RPC_URL}`);

  ARENA = await deploy("Arena", arenaArt);
  TOUR = await deploy("Tournament", tourArt, [ARENA]);

  // Ajanlar: operatörler 1..3 numaralı hesaplar (runner bunların anahtarlarını bilir)
  for (let i = 0; i < PRESETS.length; i++) {
    const [name, persona, strategy] = PRESETS[i];
    await arenaSend(accounts[0], "registerAgent", [accounts[1 + (i % 3)].address, name, persona, strategy]);
  }
  say(`${PRESETS.length} ajan kaydedildi: ${PRESETS.map((p) => p[0]).join(", ")}`);

  await newTournament(); // 2 eşleşme
  await newMatch(40); // + 1 serbest maç = 3 eşzamanlı maç

  const agentEnv = {
    ARENA_ADDRESS: ARENA, CHAIN_ID: "31337", RPC_URL,
    OPERATOR_PK_1: keyOf(accounts[1]), OPERATOR_PK_2: keyOf(accounts[2]), OPERATOR_PK_3: keyOf(accounts[3]),
    ANTHROPIC_API_KEY: "", // demo: LLM çağrısı yok, yedek beyin
    POLL_MS: "250", // yerel zincirde makbuz hızlı gelir: işlemler anahtar başına sıraya girdiği için bekleme kısa tutulur
  };
  run("ajanlar", process.execPath, ["--import", "tsx", "src/runner.ts", "watch"], { cwd: `${ROOT}agents`, env: agentEnv });

  if (!NO_WEB) {
    const next = `${ROOT}web/node_modules/next/dist/bin/next`;
    if (!existsSync(next)) throw new Error("web bağımlılıkları kurulu değil: cd web && npm install");
    // NEXT_PUBLIC_* değerleri derleme sırasında koda gömülür: adresler dağıtımdan sonra bilindiği için derleme burada yapılır
    const webOpts = {
      cwd: `${ROOT}web`,
      env: {
        NEXT_DIST_DIR: ".next-demo", NEXT_PUBLIC_RPC_URL: RPC_URL, NEXT_PUBLIC_CHAIN_ID: "31337",
        NEXT_PUBLIC_ARENA_ADDRESS: ARENA, NEXT_PUBLIC_TOURNAMENT_ADDRESS: TOUR,
      },
    };
    let prod = !WEB_DEV;
    if (prod) {
      say("web üretim modunda derleniyor (yaklaşık yarım dakika; ajanlar bu sırada oynamaya başlar)…");
      const code = await runToEnd("web-derleme", process.execPath, [next, "build"], { ...webOpts, show: /error|failed|✓ Compiled|Generating static/i });
      if (code !== 0) { say("derleme başarısız, geliştirme moduna geçiliyor"); prod = false; }
    }
    run("web", process.execPath, [next, prod ? "start" : "dev", "-p", String(WEB_PORT)], { ...webOpts, show: /error|ready|local:/i });
    await waitFor("web sunucusu", async () => (await fetch(`http://localhost:${WEB_PORT}/`)).ok, 120);
  }

  console.log(`
\x1b[1m┌──────────────────────────────────────────────────────────────┐
│  Demo hazır                                                  │
└──────────────────────────────────────────────────────────────┘\x1b[0m
  Arayüz        http://localhost:${WEB_PORT}        (turnuva: /tournament)
  Zincir RPC    ${RPC_URL}   (zincir kimliği 31337)
  Arena         ${ARENA}
  Tournament    ${TOUR}

  Bahis yapmak için cüzdanında yukarıdaki ağı ekle ve bu test hesabını içe aktar
  (herkesçe bilinen anahtar, yalnızca yerel demo):
  Hesap #4      ${accounts[4].address}
  Özel anahtar  ${keyOf(accounts[4])}   (bakiye ${formatEther(await pub.getBalance({ address: accounts[4].address }))} ETH)

  Bitenlerin yerine yeni maç ve turnuva kendiliğinden açılır. Kapatmak için Ctrl+C.
`);

  // Demoyu canlı tut
  for (;;) {
    await sleep(10_000);
    if (stopping) return;
    try {
      const running = await advanceTournaments();
      const open = await openMatchCount();
      if (running === 0 && open <= 1) await newTournament();
      else if (open < MAX_OPEN && (open === 0 || Math.random() < 0.3)) await newMatch(25);
    } catch (e) {
      console.warn("[demo] bakım hatası:", (e as Error)?.message ?? e);
    }
  }
}

main().catch((e) => {
  console.error("[demo] başlatılamadı:", e?.message ?? e);
  shutdown(1);
});
