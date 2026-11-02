# Node control

Status: the interface of `lr-node` for the program that runs it and its Mine (ADR 0013, ADR 0015). The control API is `lr-node`'s own interface; the reference implementation is `crates/node/src/control.rs`, with tests in `crates/node/src/control/tests.rs` and `crates/node/tests/lr_node.rs`. An application such as Linked Realms drives its Nodes through it; the rules for when it may switch a Mine are the application's, not LR's.

A program that drives a Node uses two listeners of it:

- **The control listener**, for the Mine and the Node's state. Only the Node's owner may call it (P5).
- **The public RPC** (`node-rpc.md`), to read the chain. It holds no key and serves no `mine_*` method. The program never asks the Node to sign anything.

`lr-node mine` needs no control listener: it mines for one address from the start, until it stops.

## The control listener

`lr-node` serves it only when started with `--control`, on one of:

- **A Unix socket**, `--control unix:PATH`. Use it when the program starts `lr-node` itself. The Node makes the socket mode 0600 and refuses a path where another user could replace it. It serves only connections from its own user (the peer's uid), and needs no secret.
- **TCP**, `--control ADDR --control-secret FILE`, for a Node the program does not start. The file holds at least 32 random bytes, and both sides read the same file. `lr-node` refuses to start a TCP control listener without one, and checks the secret on every connection, loopback included.

Transport:

- JSON-RPC 2.0 over HTTP `POST` and over WebSocket. Subscriptions need a WebSocket. Batches are not served.
- On TCP, every HTTP request and every WebSocket upgrade carries `Authorization: Bearer <the file's bytes in lowercase hex>`, compared in constant time. Anything else gets HTTP 401 with `WWW-Authenticate: Bearer`, before any JSON-RPC.
- At most 32 connections are open at once, with the secret or not; more are closed as they come. A TCP connection that has not sent the secret within 5 seconds is closed.
- Amounts are decimal strings of base units; heights, threads and counts are numbers; ids are lowercase hex; addresses are their text form (`identity.md`).

The Node has one Mine, with the id `default` (ADR 0016). The id stays in the API as a field. The Mine is off whenever `lr-node` starts, unless it was started with the `mine` command, which mines from the start: nothing about "on" is stored (P5).

## Methods

ADR 0013 also names `lr_getConnections` and `lr_addNode` for this listener; they are not built yet.

**`node_info()`**: the Node's state and what its Mine may use.

```json
{ "height": 1234, "tip": "5f0c…", "connections": 8, "synced": true, "maxThreads": 7, "memoryAvailableMiB": 6120 }
```

- `maxThreads` is `max(1, cores − 1)`, lowered by `MINE_MAX_THREADS` if it is set.
- `memoryAvailableMiB` is `null` where the Node cannot read it.

**`mine_status({ "id": "default" })`**: what the Mine is really doing, not what was asked.

```json
{ "id": "default", "state": "on", "threads": 2, "mode": "fast", "hashRate": 1180.5, "blocksWon": 3, "rewardAddress": "tlr1…" }
```

- `state` is `off`, `starting` (the RandomX dataset is being built) or `on`.
- `mode` is `fast` or `light` while on, and `null` while off or starting.
- `hashRate` is hashes a second over the last 10 seconds.
- `blocksWon` counts the Blocks this Mine found that the Node took into its best chain since it started.
- `rewardAddress` is the address of the last start, or `null` before the first.

**`mine_start({ "id": "default", "rewardAddress": "tlr1…", "threads": 2, "mode": "auto" })`** returns the status.

- `threads` is 1 to `maxThreads`.
- `mode` is `auto` (fast if at least 2.5 GiB is available, else light), `fast` or `light`.
- The Node must be synced. A start while the Mine runs stops it first, then starts it with the new settings.

**`mine_stop({ "id": "default" })`** returns the status, once the threads have stopped.

**`mine_subscribe({ "id": "default" })`** (WebSocket; `mine_unsubscribe` ends it) sends notifications:

- `mine_status`: the status, once at the start, then on each change, at most every 2 seconds;
- `mine_blockFound`, once the Node has taken a Block this Mine's own `submit` produced into its best chain (P3):

```json
{ "id": "default", "height": 1240, "hash": "0a91…", "reward": "500004000", "rewardAddress": "tlr1…", "time": 1793232000 }
```

- `reward` is the Block reward at that height plus the Block's fees.
- A win is found by the Block's id, not by its reward address. Addresses are public, so a Block from another Node that names the same address is not this Mine's win.

## Errors

| Code | Message | When |
|---|---|---|
| -32002 | `node-unavailable` | the Node is not running, or not synced for `mine_start` |
| -32602 | `bad-address` | `rewardAddress` is not an address |
| -32602 | `bad-threads` | `threads` is 0 or more than `maxThreads` |
| -32602 | `unknown-mine` | a Mine id other than `default` |
| -32602 | (jsonrpsee's) | other malformed parameters |
| -32601 | | no such method |
| HTTP 401 | | a TCP request without the secret |
