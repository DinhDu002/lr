# AGENTS.md — lr

LR: a Proof-of-Work chain that holds money and nothing else. Gold is mined like Bitcoin: every Node checks every Block, and anyone can run a Mine for an address, off until they start it. Keys stay in the user's wallet, and the company holds no key but the Checkpoint signer's, which the project owner keeps off the company's servers. This repository is LR alone (ADR 0017); its first application, Linked Realms, has its own repository. The main network starts after the chain-only test on the test network. The project owner decides every merge.

## Required

- The full plan is in `PLAN.md`. Before doing anything, read section 2 (principles), section 3 (architecture), section 5 (rules) and the current step in section 6.
- Use the terms defined in `CONTEXT.md` (LR's glossary). Do not introduce synonyms for them.
- After each completed task, update section 12 (Progress) and the Log in `PLAN.md`.

## Principles that must never be broken

Summary; details in `PLAN.md` section 2, approved by the project owner on 2026-11-03 (ADR 0017).

1. Gold is decided only by chain rules that every Node checks; no application or service can change the chain.
2. No service holds a user's key. Keys stay in the user's wallet. The company's services hold no key; the Checkpoint signer's key is the project owner's, on their own machine.
3. Every Node checks every Block itself: Proof of Work, signatures and rules.
4. Gold is created only on a fixed schedule: halvings, then a small constant reward per Block forever; no premine.
5. Mining runs only when its owner turns it on, with a CPU limit, and never covertly.
6. The wallet shows every transaction in full in its own prompt before it signs.
7. The main network starts after the chain-only test, only the project owner launches it, and it is never reset; rules change only through network upgrades.
8. The chain holds only money; applications keep their own data.
9. Chain rules are defined once in `crates/core`, tested against fixed vectors, and used by the Node, the Mine and the wallet (through `@dinhdu002/lr-core`).
10. Transactions and addresses carry a version and a scheme id so they can be extended.

## Conventions

- All repository content is in English: code, comments, documentation, ADRs and commit messages.
- pnpm + Turborepo, TypeScript strict, Vitest. The chain is a Cargo workspace in `crates/` (Rust pinned in `rust-toolchain.toml`), formatted with `cargo fmt` and linted with `cargo clippy`. `packages/core` is the WebAssembly build of `crates/core` (`wasm-bindgen`), published as `@dinhdu002/lr-core`, and built by Turbo before any `typecheck` or `test` that needs it. `packages/wallet` is LR's web wallet.
- Docker: `compose.yaml` file, `docker compose` command, every image pinned to a version.
- New code must have tests. Run `pnpm test` and `cargo test` before reporting that work is done.
- Do not commit secrets; put sample environment variables in `.env.example`.
- Do not merge into `main` yourself, do not push to the remote, and do not deploy unless asked.
- New architecture decisions: write an ADR in `docs/decisions/`.
- Unclear rules or requirements: ask, do not guess.

## Common commands

Node.js 26 (`.nvmrc`), pnpm 11.3, Rust per `rust-toolchain.toml`, `wasm-bindgen-cli` 0.2.129.

```bash
pnpm install
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test
cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
pnpm --filter @dinhdu002/lr-core build   # the WebAssembly build alone
docker compose up -d                     # the dev network: a seed Node and the wallet
docker compose --profile mine up -d      # and a Mine on the dev network
pnpm e2e:chain                           # the wallet against compose.yaml
```
