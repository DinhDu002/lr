import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, walletHeaders } from "./headers.ts";

describe("headers", () => {
  it("has the policy of the plan, with the Public node's origin", () => {
    expect(contentSecurityPolicy("https://rpc.example.org/")).toBe(
      "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' https://rpc.example.org; frame-ancestors 'none'; object-src 'none'; base-uri 'none'",
    );
  });

  it("keeps the strict policy for `vite preview` and relaxes only styles and the WebSocket for `vite`", () => {
    const dev = contentSecurityPolicy("http://localhost:9445", true);
    expect(dev).toContain("style-src 'self' 'unsafe-inline'");
    expect(dev).toContain("ws://localhost:*");
    expect(dev).toContain("frame-ancestors 'none'");
    expect(contentSecurityPolicy("http://localhost:9445")).not.toContain(
      "unsafe-inline",
    );
  });

  it("names the build setting that is not a URL", () => {
    // a build argument such as https://${HOST} gives "https://" while HOST is unset
    expect(() => contentSecurityPolicy("https://")).toThrow(
      'VITE_NODE_URL is not a URL: "https://"',
    );
  });

  it("isolates the browsing context group", () => {
    expect(walletHeaders("http://localhost:9445")).toMatchObject({
      "Cross-Origin-Opener-Policy": "same-origin",
    });
  });
});
