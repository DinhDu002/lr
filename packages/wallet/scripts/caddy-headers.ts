// Prints the wallet's response headers (src/headers.ts) as a Caddy `header` block, so the image
// sends exactly what `vite preview` and the browser tests use. Run with the build's VITE_NODE_URL.
import { walletHeaders } from "../src/headers.ts";

const nodeUrl = process.env.VITE_NODE_URL || "http://localhost:9445";
const lines = Object.entries(walletHeaders(nodeUrl)).map(([name, value]) => {
  if (value.includes('"')) throw new Error(`${name} cannot hold a quote`);
  return `\t${name} "${value}"`;
});
console.log(["header {", ...lines, "}"].join("\n"));
