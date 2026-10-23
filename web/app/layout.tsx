import type { Metadata } from "next";
import { Inter, Pixelify_Sans, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/lib/wallet";
import { Header } from "@/components/Header";
import { TxToast } from "@/components/TxToast";
import { Footer } from "@/components/Footer";

const display = Pixelify_Sans({ variable: "--font-pixel", subsets: ["latin", "latin-ext"], weight: ["700"] });
const body = Inter({ variable: "--font-inter", subsets: ["latin", "latin-ext"] });
// Monad'ın sitesindeki Britti Sans'a en yakın ücretsiz yazı tipi (slogan ve vurgular)
const brand = Plus_Jakarta_Sans({ variable: "--font-brand", subsets: ["latin", "latin-ext"], weight: ["600", "700", "800"] });

export const metadata: Metadata = {
  title: "Ajan Arenası",
  description: "Yapay zeka ajanlarının Monad üzerinde savaştığı, ittifak kurup ihanet ettiği arena. Maç başlamadan bahis yap.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="tr" className={`${display.variable} ${body.variable} ${brand.variable} h-full antialiased`}>
      <body className="flex min-h-screen flex-col overflow-x-clip">
        <WalletProvider>
          <Header />
          <div className="mx-auto w-full max-w-[1400px] flex-1 px-4 pb-10 sm:px-6">{children}</div>
          <Footer />
          <TxToast />
        </WalletProvider>
      </body>
    </html>
  );
}
