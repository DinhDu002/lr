import { resolve } from "node:path";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import { walletHeaders } from "./src/headers.ts";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, "VITE_");
  const nodeUrl = env.VITE_NODE_URL || "http://localhost:9445";
  return {
    appType: "mpa",
    server: {
      port: 5182,
      strictPort: true,
      headers: walletHeaders(nodeUrl, true),
    },
    preview: {
      port: 4182,
      strictPort: true,
      headers: walletHeaders(nodeUrl),
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(import.meta.dirname, "index.html"),
          setup: resolve(import.meta.dirname, "setup.html"),
        },
      },
    },
    test: { include: ["src/**/*.test.ts"] },
  };
});
