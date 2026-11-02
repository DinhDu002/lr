// Fixed when the wallet is built (.env.example).
const DEFAULT_NODE_URL = "http://localhost:9445";

/** LR's networks by the names `lr-node --network` takes (crates/core/test-vectors/chain.json). */
export const NETWORK_IDS = { test: 3, dev: 2 } as const;

/** The id of the network named `name`; throws for one the wallet does not know. */
export function networkIdOf(name: string): number {
  if (!Object.hasOwn(NETWORK_IDS, name))
    throw new Error(`This wallet was built for an unknown network: ${name}`);
  return NETWORK_IDS[name as keyof typeof NETWORK_IDS];
}

// ponytail: the Public node is fixed when the wallet is built, so the CSP can name it. A Node the
// Player chooses needs a wider connect-src; it waits on the project owner.
export const nodeUrl = (
  (import.meta.env.VITE_NODE_URL as string | undefined) || DEFAULT_NODE_URL
).replace(/\/+$/, "");
/** The network the wallet signs for: a Node on another one is refused. */
export const network =
  (import.meta.env.VITE_NETWORK as string | undefined) || "test";
