# LR

LR is a Proof-of-Work chain that holds money and nothing else. Its money is Gold (`GOLD`), kept in Accounts under rules that every Node checks for itself. Gold is created only as Block rewards, on a fixed schedule with no premine, and anyone can run a Mine for an address. Its first application is the game [Linked Realms](https://github.com/DinhDu002/linked-realms), which lives in its own repository.

> **Status:** the chain is built and runs on the test network. Next come release v0.1.0, a chain-only test (three people on three machines mine, send Gold to one another and see Checkpoints signed), and then the main network, which only the project owner launches and which is never reset. Details: [PLAN.md](PLAN.md) section 6 and [ADR 0017](docs/decisions/0017-lr-alone-the-game-moves-out.md).

## The test network

Running since 2026-11-02, network id 3. It may be reset, and it stops once the main network starts. Test Gold is worth nothing.

| Service | Where |
| --- | --- |
| Seed Node | `seed.linkedrealms.com:9444` |
| Public node (RPC, CORS `*`) | <https://rpc.linkedrealms.com> |
| Archive | run by the company, no public address |
| Checkpoint signer | the project owner's machine |

The services are run from [docs/runbooks/lr-services.md](docs/runbooks/lr-services.md).

## Get an address and send Gold

LR's web wallet keeps your key behind a password, shows your balance and sends Gold. Run it locally against the test network:

```bash
VITE_NODE_URL=https://rpc.linkedrealms.com VITE_NETWORK=test pnpm --filter @dinhdu002/lr-wallet dev
```

Or build it as a container: `docker build --target wallet --build-arg VITE_NODE_URL=https://rpc.linkedrealms.com --build-arg VITE_NETWORK=test -t lr-wallet .`, then run it and open its port. Create a new key, write down its 24 words (nobody can recover them for you), and copy your address: it starts with `tlr1` on the test network. See [packages/wallet/README.md](packages/wallet/README.md).

## Run a Node and mine on the test network

`lr-node` is the Node, and `lr-node mine` is a Node with a Mine for one address. A Mine runs only when you start it, on the threads you give it.

```bash
docker run -d --name lr-mine -v lr-data:/data ghcr.io/dinhdu002/lr-node:<version> \
  mine --reward-address <your tlr1… address> --network test \
  --seed seed.linkedrealms.com:9444 --threads 1 --mode light --data /data
docker logs -f lr-mine
docker stop lr-mine   # stops mining
```

- `<version>` is a release's version, such as `0.1.0`; the image is published from v0.1.0 on.
- A new Node syncs the chain from the seed, checking every Block, before it can win Blocks. The chain is kept in the `lr-data` volume.
- `--mode light` hashes over a 256 MiB cache and needs little memory. `--mode fast` hashes over a dataset of about 2 GiB, several times faster per thread, and needs that memory free. `--mode auto` (the default) takes fast when at least 2.5 GiB is available.
- `--threads` is how many CPU threads mine (default 1). Mining is off at every start unless you run `mine`.
- Block rewards and fees go to `--reward-address`; the Node holds no key.

Other flags (`--listen`, `--rpc`, `--archive`, `--control`) are listed in the usage that `lr-node` prints for a flag it does not know (`crates/node/src/main.rs`); see also [docs/protocols/node-control.md](docs/protocols/node-control.md) and [docs/protocols/node-rpc.md](docs/protocols/node-rpc.md).

## The package `@dinhdu002/lr-core`

`packages/core` is the WebAssembly build of `crates/core`, published on GitHub Packages as `@dinhdu002/lr-core`: keys from 24 words, signing, addresses, amounts and transaction encoding, the same code the Node runs. `accountKey(entropy, index)` gives LR's wallet key; an application may derive its own keys under its own labels ([docs/protocols/identity.md](docs/protocols/identity.md)).

## Development

Requirements: Node.js 26 (see `.nvmrc`), pnpm 11.3, Rust through `rustup` (the version is pinned in `rust-toolchain.toml`) with `wasm-bindgen-cli` 0.2.129, CMake and a C++ compiler (RandomX), and Docker.

```bash
cargo install wasm-bindgen-cli --version 0.2.129 --locked
pnpm install
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test   # builds packages/core (WebAssembly) first
cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
docker compose up -d                 # the dev network: a seed Node (RPC on 127.0.0.1:9445) and the wallet (http://127.0.0.1:8788)
docker compose --profile mine up -d  # and a Mine on the dev network
pnpm e2e:chain                       # the wallet's browser test against compose.yaml
```

Copy `.env.example` to `.env` to change the local ports.

## Layout

| Path | What it is |
| --- | --- |
| `crates/core` | Chain rules, encodings, hashing, ML-DSA keys, addresses; native and WebAssembly |
| `crates/node` | `lr-node`: the Node, its RPC, the Mine and the Checkpoint signer |
| `crates/randomx` | RandomX v2 behind a safe binding |
| `packages/core` | `@dinhdu002/lr-core`, the WebAssembly package |
| `packages/wallet` | `@dinhdu002/lr-wallet`, LR's web wallet |
| `deploy/` | The company's services: `compose.chain.yaml`, `compose.signer.yaml` |

## Documents

- [PLAN.md](PLAN.md): principles, architecture, rules, roadmap and progress.
- [CONTEXT.md](CONTEXT.md): LR's glossary.
- [docs/decisions/](docs/decisions/): architecture decision records.
- [docs/protocols/](docs/protocols/): identity, transactions, blocks, the P2P protocol, the RPC and the Node's control listener.
- [docs/runbooks/lr-services.md](docs/runbooks/lr-services.md): run the company's services.
- [CONTRIBUTING.md](CONTRIBUTING.md): how changes get in.

## License

MIT. See [LICENSE](LICENSE).
