# Running LR's services

LR's company services are a seed node that every other Node dials first, the Public node whose RPC wallets read, an archive that keeps every Block, and the web wallet's pages. They are one compose project, `deploy/compose.chain.yaml`, on one server behind its Caddy. The Checkpoint signer runs on the project owner's own machine, from `deploy/compose.signer.yaml`. The Nodes run the `lr-node` image, which holds the binary and no key; the wallet's image holds only its pages, and each user's key stays in their browser.

Since 2026-11-02 they serve the test network (id 3): the seed `seed.linkedrealms.com:9444`, the Public node `https://rpc.linkedrealms.com` (CORS `*`) and the archive, with the Checkpoint signer on the project owner's machine. Since 2026-11-03 the wallet is at `https://wallet.linkedrealms.com`. The main network comes after the chain-only test (`PLAN.md` section 6, P7).

## 1. The server

A Linux machine with Docker Engine and the Compose plugin, a Caddy in front of it, and a clone of this repository.

```bash
git clone https://github.com/DinhDu002/lr.git && cd lr
cp deploy/.env.example deploy/.env
chmod 600 deploy/.env
```

In `deploy/.env`, set `LR_RPC_URL` to the Public node's public address (section 2, step 2), which the wallet's pages call. Change `LR_P2P_PORT` (9444) or `LR_NETWORK` (`test`) only to leave their defaults.

## 2. The chain

1. Open the P2P port to the internet: TCP 9444, or `LR_P2P_PORT`. It is the only port the chain publishes.
2. Choose a name for the Public node's RPC, `rpc.example.org` here, give it DNS, and add it to the Caddy in front:

   ```
   rpc.example.org {
   	reverse_proxy 172.31.0.3:9445
   }
   ```

3. Start the chain, then join Caddy to its network at the one address the Public node trusts for `X-Forwarded-For`, so it counts its rate limits for each client and not for Caddy:

   ```bash
   docker compose -f deploy/compose.chain.yaml up -d --build
   docker network connect --ip 172.31.0.10 linked-realms-chain_default <the Caddy container>
   curl -s https://rpc.example.org -H 'Content-Type: application/json' \
     -d '{"jsonrpc":"2.0","id":1,"method":"lr_getInfo"}'   # the tip, and latestCheckpoint
   ```

   The wallet (step 4) is built with that address, `LR_RPC_URL`, and the network, and calls only it.

   Recreating the Caddy container drops the join; run `docker network connect` again. If the subnet `172.31.0.0/24` is already used on the server, change it, the two addresses and `--rpc-proxy` in `deploy/compose.chain.yaml` together.

4. Choose a name for the wallet, `wallet.example.org` here, give it DNS, and add it to the Caddy in front. The image sends its own headers, among them the CSP, which lets its pages call `LR_RPC_URL` and nothing else:

   ```
   wallet.example.org {
   	reverse_proxy linked-realms-chain-wallet-1:80
   }
   ```

   A new `LR_RPC_URL` or `LR_NETWORK` needs the image built again: `docker compose -f deploy/compose.chain.yaml up -d --build wallet`.

The compose project is named `linked-realms-chain`, its `public` service's container `linked-realms-chain-public-1` and its `wallet` service's `linked-realms-chain-wallet-1`. The live Caddy names them, so a rename needs the Caddy changed with it.

## 3. The Checkpoint signer

It runs on the project owner's own machine, never on the chain's server: its key can rewrite deep history (ADR 0015). It is a Node that checks every Block itself and dials the seed. Once it is synced, it signs the Block at each multiple of 10 that is at least 6 Blocks below its tip, and its Checkpoints reach every Node through the seed. Its key is the 24 words of the network's Checkpoint signer key, in a file on that machine, which compose mounts as a secret. `lr-node` refuses words that are not the network's key.

```bash
sudo chown 10001 /path/to/words && sudo chmod 0400 /path/to/words   # on Linux: the image's user reads it
LR_SEED=seed.example.org:9444 CHECKPOINT_WORDS=/path/to/words \
  docker compose -f deploy/compose.signer.yaml up -d --build
docker compose -f deploy/compose.signer.yaml logs -f   # "checkpoint <height> <Block id>" every 10 Blocks
```

`LR_SEED` is the chain server's name, or its address, and the P2P port. A name is looked up when the signer starts, so restart the signer after the server's address changes.

## 4. After a reset of the test network

A reset (ADR 0012 decision 6; ADR 0016 made it id 3) makes a Node refuse the data of the old one (`OtherNetwork`). Before starting images from after the reset, delete the old chain data: `docker compose -f deploy/compose.chain.yaml down -v` and `docker compose -f deploy/compose.signer.yaml down -v`. The words file is not in a volume. Anyone who runs their own Node deletes its data folder.

## 5. The chain-only test

The gate before the main network (ADR 0017). With the chain running and the signer printing Checkpoints:

1. Three people, on three different machines, each run `lr-node mine` on the test network with their own address (`README.md`, "Run a Node and mine on the test network").
2. Each wins Blocks: their balance grows in the wallet.
3. They send Gold to one another with the wallet. The recipient sees it as received once a Block holds it.
4. The signer keeps signing Checkpoints throughout.
5. Record the date, the three machines, a Block each Mine won and a transfer each person sent in `PLAN.md`'s Log.

## Everyday tasks

| Task | Command |
|---|---|
| Update the chain | `git pull`, then `docker compose -f deploy/compose.chain.yaml up -d --build`, and the same on the signer's machine with `deploy/compose.signer.yaml` |
| Logs | `docker compose -f deploy/compose.chain.yaml logs -f`; the signer prints each Checkpoint it signs |
| Back up | Keep `deploy/.env`. The chain can be rebuilt from other Nodes; the signer's words file is the project owner's own copy |

## Known limits

- The Public node's RPC takes 128 connections in all. Its rate limits count calls for each client, but one client can hold every WebSocket.
- The Checkpoint signer trusts the Nodes it dials to show it the best chain: it cannot see a longer branch that the seed hides from it.
