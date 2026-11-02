import { defineConfig, devices } from "@playwright/test";
import {
  NODE_PORT,
  NODE_URL,
  WALLET_ORIGIN,
  WALLET_PORT,
} from "./e2e/ports.ts";

export default defineConfig({
  testDir: "e2e",
  testMatch: "*.spec.ts",
  fullyParallel: true,
  reporter: [["list"]],
  use: { baseURL: WALLET_ORIGIN, trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: devices["Desktop Chrome"] },
    { name: "firefox", use: devices["Desktop Firefox"] },
  ],
  webServer: [
    {
      command: "node e2e/servers.ts",
      url: `http://localhost:${NODE_PORT}/__sent`,
      reuseExistingServer: false,
    },
    {
      // The Node's URL is fixed when the wallet is built.
      command: `pnpm vite build && pnpm vite preview --port ${WALLET_PORT}`,
      url: WALLET_ORIGIN,
      env: { VITE_NODE_URL: NODE_URL, VITE_NETWORK: "test" },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
