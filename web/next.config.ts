import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // İkinci bir geliştirme sunucusu (ör. yerel zincir önizlemesi) için ayrı çıktı klasörü: NEXT_DIST_DIR=.next-local
  distDir: process.env.NEXT_DIST_DIR || ".next",
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
