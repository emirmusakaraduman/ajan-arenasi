"use client";

import { explorerTx } from "@/lib/arena";
import { useWallet } from "@/lib/wallet";

export function TxToast() {
  const { tx, resetTx } = useWallet();
  if (tx.status === "idle") return null;
  const busy = tx.status === "wallet" || tx.status === "pending";
  return (
    <div role="status" className="fixed bottom-4 left-1/2 z-30 flex max-w-[92vw] -translate-x-1/2 items-center gap-3 rounded-xl border border-line bg-deep px-4 py-3 text-sm shadow-lg">
      <span className={tx.status === "error" ? "text-hit" : tx.status === "done" ? "text-ally" : "text-chalk"}>
        {tx.status === "wallet" && "Cüzdanında işlemi onayla"}
        {tx.status === "pending" && "İşlem zincirde onaylanıyor"}
        {tx.status === "done" && "İşlem onaylandı"}
        {tx.status === "error" && tx.message}
      </span>
      {tx.hash && (
        <a href={explorerTx(tx.hash)} target="_blank" rel="noreferrer" className="text-monad underline">Explorer&apos;da gör</a>
      )}
      {!busy && <button type="button" onClick={resetTx} className="text-mute hover:text-chalk" aria-label="Kapat">×</button>}
    </div>
  );
}
