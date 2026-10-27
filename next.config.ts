import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Docker image is built with NEXT_OUTPUT=standalone: a self-contained
  // server with only the files it needs. `next start` does not serve that
  // layout, so development and the tests build the ordinary way.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  // The Open Graph images read their font from disk (src/lib/og/image.tsx).
  outputFileTracingIncludes: {
    "/**/og.png": ["./src/fonts/source-serif-4/*.ttf"],
  },
};

export default nextConfig;
