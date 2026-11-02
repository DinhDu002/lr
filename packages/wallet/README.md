# @dinhdu002/lr-wallet

LR's web wallet: the page where a person keeps the key of an LR account, reads its Gold and sends Gold. It is a static Vite + TypeScript site, with no framework. Keys, signatures and addresses come from `@dinhdu002/lr-core` (the WebAssembly build of `crates/core`); the key is `accountKey(entropy, 0)`, so the same 24 words give the same address in every LR wallet.

- **`setup.html`** creates an account (24 words to write down, three of them confirmed, a password) or restores one from its 24 words. It is the only page that asks for the words.
- **`index.html`** unlocks the account, shows its address (with a copy button) and its Gold: balance, Send with a memo and a fee, and the recent transactions. `public/manifest.json` (`display: standalone`) lets a phone add it to the Home Screen.

## Run

```bash
cp .env.example .env              # optional
pnpm --filter @dinhdu002/lr-core build   # once; needs Rust and wasm-bindgen-cli
pnpm --filter @dinhdu002/lr-wallet dev    # http://localhost:5182
pnpm --filter @dinhdu002/lr-wallet build  # dist/
```

WebCrypto and WebAssembly need a secure context: `localhost` in development, HTTPS in production. `docker compose up -d --build` (repository root) runs the wallet next to a Node on the dev network at http://localhost:8788.

## Configuration

| Variable        | Default                 | Meaning                                                                                                                                                                                                           |
| --------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_NODE_URL` | `http://localhost:9445` | The Public node's RPC (`docs/protocols/node-rpc.md`), fixed when the wallet is built so the CSP can name it. The wallet reads balances, the fee rate and transactions there and sends the transactions it signed. |
| `VITE_NETWORK`  | `test`                  | The network the wallet signs for, `test` or `dev` (the names `lr-node --network` takes). A Node on another network is refused before anything is signed.                                                          |

## Security model

- **Keys stay here.** Setup draws 32 random bytes, shows them as 24 words, and stores them encrypted in IndexedDB in this origin: `{ version, address, kdf: { alg: "argon2id", m: 65536, t: 3, p: 1, salt }, iv, ciphertext }`. The key is Argon2id (`hash-wasm`) over the password, the cipher is AES-GCM through WebCrypto with a fresh IV, and the address is the additional data. The parameters live in the record, so they can be raised later.
- **Lock.** After 15 minutes without input, or when the person chooses Lock, the wallet frees the key (in WebAssembly memory) and zeroes the decrypted bytes. Unlocking asks for the password in the wallet's own modal.
- **Gold.** The wallet reads the balance, the fee rate and the recent transactions from the Public node, which holds no key. Send checks the recipient (`isAddress`), the amount (`parseAmount`, more than 0), the memo (at most 80 bytes) and the balance with the fee, which is the Node's fee rate times the transfer's bytes unless the person types one. It then shows the payment prompt, and builds and signs the transfer in WebAssembly only on Approve, for the network it was built for. A send is listed as waiting from the moment it is signed until a Block holds it, so one whose answer from the Node was lost still shows whether the Node holds it, and a retry does not pay twice unseen; one that leaves the Node without a Block is reported.
- **The payment prompt.** Every line is the wallet's own, with the full recipient address, the amount, the memo (control, bidi, invisible, unusual-space and unassigned characters, and `\`, shown as escapes: `src/escape.ts`), the fee and the total. Approve is not focused and answers only a trusted pointer click, and only one second after the prompt opened. Deny, Escape or closing answers `denied`.
- **Headers.** The `wallet` image (`docker build --target wallet .`) serves `dist/` with Caddy, sending the headers of `src/headers.ts` written out by `scripts/caddy-headers.ts`. `vite.config.ts` sets the same ones for `vite` and `vite preview`: a CSP with `script-src 'self' 'wasm-unsafe-eval'`, `connect-src 'self'` with the Public node's origin only, `frame-ancestors 'none'`, and `Cross-Origin-Opener-Policy: same-origin`. The dev server also allows injected styles and its WebSocket.

## Tests

- `pnpm --filter @dinhdu002/lr-wallet test`: Vitest, no browser. The key store (round trip, wrong password, address binding), the vault (lock wipes the key and the entropy; the idle timer; account 0 by default), the memo's escaping, the headers, the Node client, and Send's checks, fee and signing with a real key.
- `pnpm --filter @dinhdu002/lr-wallet test:browser`: Playwright in `e2e/`, Chromium and Firefox. The first run needs `pnpm --filter @dinhdu002/lr-wallet exec playwright install chromium firefox`. It builds the wallet against a stub Node (`e2e/node-stub.ts`, where every account holds 10 GOLD and every transfer sent is recorded unchecked). The tests cover Setup and unlocking, the balance, the payment prompt (nothing sent before a click, Deny, Escape, escaped memos, refused input), Lock and the idle lock, the manifest and the headers. Fixed ports: 4182 (wallet), 8794 (Node stub).
- `pnpm e2e:chain` (from the repository root): Playwright in `e2e-chain/`, Chromium, against a real dev network: `docker compose -p lr-e2e --profile mine up -d --build`, with `NODE_RPC_PORT` and `WALLET_PORT` set to the ports compose publishes if they are not the defaults. Development account 1 is restored and waits for its Mine's reward, sends 1.25 GOLD with a memo to development account 2 through the payment prompt, and sees it confirmed; account 2, restored in a second browser context, sees its balance grow by the amount. It mines on this machine's CPU for a few seconds. Stop the stack with `docker compose -p lr-e2e --profile mine down -v`.

## Known limits

- The password string and the browser's own copies of what was typed or decrypted cannot be wiped from JavaScript.
- Argon2id runs on the page's thread: unlocking may pause the page for about a second.
- The Public node is fixed when the wallet is built: a person cannot choose another Node yet, because the CSP would have to allow it.
- A send waits in the wallet's memory only: after a reload it shows once a Block holds it.
- The wallet trusts the Public node for what it shows (balance, transactions); it never trusts it with a key, and it signs only for its own network.
- Safari may delete script-written storage, IndexedDB included, for a site the person has not interacted with in 7 days (WebKit's Intelligent Tracking Prevention; see <https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/>, not tested here). The 24 words are the backup.
