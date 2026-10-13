import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Docker image is built with NEXT_OUTPUT=standalone: a self-contained
  // server with only the files it needs. `next start` does not serve that
  // layout, so development and the tests build the ordinary way.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
};

export default nextConfig;
