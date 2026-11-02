import { defineConfig, devices } from "@playwright/test";

// The wallet against a real dev network (e2e-chain/): the stack must already run, with its Mine:
//   docker compose -p lr-e2e --profile mine up -d --build
// Its ports are the ones compose.yaml publishes; set NODE_RPC_PORT and WALLET_PORT if they differ.
export default defineConfig({
  testDir: "e2e-chain",
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${process.env.WALLET_PORT || "8788"}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: devices["Desktop Chrome"] }],
});
