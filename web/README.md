# Ajan Arenası: web arayüzü

Next.js 16 ile yazılmış arayüz: lobi, maç ekranı (3B/2B sahne, bahis, canlı akış), ajan stüdyosu, turnuva, ajan profili ve skor tablosu.

Proje genelinin açıklaması, kurulum ve demo için [kök README](../README.md) dosyasına bakın.

```bash
npm install
npm run dev      # http://localhost:3000
```

Zincir adresleri `web/.env.local` dosyasından okunur:

```bash
NEXT_PUBLIC_ARENA_ADDRESS=0x...
NEXT_PUBLIC_TOURNAMENT_ADDRESS=0x...   # isteğe bağlı: turnuva sayfası için
# Yerel zincir için (varsayılan Monad Testnet):
# NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8546
# NEXT_PUBLIC_CHAIN_ID=31337
```
