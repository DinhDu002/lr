// Starts the Node stub for Playwright's `webServer`.
import { startNodeStub } from "./node-stub.ts";

await startNodeStub();
console.log("e2e servers ready");
setInterval(() => {}, 1 << 30); // stay up until Playwright stops us
