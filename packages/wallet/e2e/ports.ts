// Fixed ports of the browser tests: the Node's URL is baked into the wallet at build time.
export const WALLET_PORT = 4182;
export const NODE_PORT = 8794;

export const WALLET_ORIGIN = `http://localhost:${WALLET_PORT}`;
export const NODE_URL = `http://localhost:${NODE_PORT}`;
