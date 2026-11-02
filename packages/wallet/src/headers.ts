// Response headers for the wallet's pages. Caddy sends the same ones in production;
// vite.config.ts sets them for `vite` and `vite preview`, so the browser tests run under them.

/** The origin of `url`, or an error naming the build setting it came from. */
function originOf(setting: string, url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    throw new Error(`${setting} is not a URL: "${url}"`);
  }
}

/**
 * `connect-src` names the Public node, the only server the wallet calls. `dev` adds what Vite's
 * dev server needs (injected styles and its WebSocket).
 */
export function contentSecurityPolicy(nodeUrl: string, dev = false): string {
  const node = originOf("VITE_NODE_URL", nodeUrl);
  return [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    dev ? "style-src 'self' 'unsafe-inline'" : undefined,
    `connect-src 'self' ${node}${dev ? " ws://localhost:* ws://127.0.0.1:*" : ""}`,
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'none'",
  ]
    .filter(Boolean)
    .join("; ");
}

export function walletHeaders(
  nodeUrl: string,
  dev = false,
): Record<string, string> {
  return {
    "Content-Security-Policy": contentSecurityPolicy(nodeUrl, dev),
    "Cross-Origin-Opener-Policy": "same-origin",
  };
}
