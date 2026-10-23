"use client";

import { createContext, createElement, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { createWalletClient, custom, type Abi, type EIP1193Provider } from "viem";
import { ARENA_ADDRESS, arenaAbi, monadTestnet, publicClient } from "./arena";

export type TxState = { status: "idle" | "wallet" | "pending" | "done" | "error"; hash?: string; message?: string };

const eth = (): EIP1193Provider | undefined => (typeof window === "undefined" ? undefined : (window as unknown as { ethereum?: EIP1193Provider }).ethereum);

function useWalletState() {
  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [tx, setTx] = useState<TxState>({ status: "idle" });

  useEffect(() => {
    // Daha önce izin verilmişse sessizce bağlan
    eth()?.request({ method: "eth_accounts" }).then((a) => a[0] && setAddress(a[0])).catch(() => {});
  }, []);

  const client = useCallback(() => createWalletClient({ chain: monadTestnet, transport: custom(eth()!) }), []);

  const connect = useCallback(async () => {
    if (!eth()) { setTx({ status: "error", message: "Tarayıcıda cüzdan bulunamadı. MetaMask ya da Rabby kur." }); return null; }
    const w = client();
    const [account] = await w.requestAddresses();
    await w.switchChain({ id: monadTestnet.id }).catch(() => w.addChain({ chain: monadTestnet }));
    setAddress(account);
    return account;
  }, [client]);

  /** Arena kontratında (ya da verilen başka bir kontratta, ör. turnuva) bir fonksiyon çağırır; cüzdan onayı ve zincir onayını bekler. */
  const send = useCallback(
    async (functionName: string, args: unknown[], value?: bigint, target?: { address: `0x${string}`; abi: Abi | readonly unknown[] }) => {
      try {
        const account = address ?? (await connect());
        if (!account) return null;
        setTx({ status: "wallet" });
        const hash = await client().writeContract({
          account, address: target?.address ?? ARENA_ADDRESS, abi: (target?.abi ?? arenaAbi) as Abi, functionName, args, value, chain: monadTestnet,
        } as never);
        setTx({ status: "pending", hash });
        await publicClient.waitForTransactionReceipt({ hash });
        setTx({ status: "done", hash });
        return hash;
      } catch (e) {
        const err = e as { shortMessage?: string; message?: string };
        setTx({ status: "error", message: err?.shortMessage ?? err?.message ?? "İşlem gönderilemedi" });
        return null;
      }
    },
    [address, client, connect],
  );

  return { address, connect, send, tx, resetTx: () => setTx({ status: "idle" }) };
}

type WalletApi = ReturnType<typeof useWalletState>;
const Ctx = createContext<WalletApi | null>(null);

/** Cüzdan durumu tüm sayfalarda ortaktır: üstteki menüde bağlanan cüzdan maç ekranında da geçerlidir. */
export function WalletProvider({ children }: { children: ReactNode }) {
  return createElement(Ctx.Provider, { value: useWalletState() }, children);
}

export function useWallet(): WalletApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWallet yalnızca WalletProvider içinde kullanılabilir");
  return v;
}
