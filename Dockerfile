# Two images:
# - `wallet` (docker build --target wallet): LR's web wallet, the static pages behind Caddy with
#   their headers. The Public node's RPC and the network are fixed when it is built:
#   --build-arg VITE_NODE_URL=https://rpc.example.org --build-arg VITE_NETWORK=test.
# - `lr-node`, the last stage and so the default target: a Node of LR, for the company's seed,
#   Public node, archive and Checkpoint signer (deploy/compose.chain.yaml,
#   deploy/compose.signer.yaml) and for compose.yaml.
# The WebAssembly core and the wallet's pages are built on the build machine's platform. `lr-node`
# is built for the image's own platform, so image.yml builds each platform on a runner of that
# architecture rather than under emulation.

# wasm-bindgen-cli, the version in crates/core/Cargo.toml, for the build machine's architecture.
FROM scratch AS wasm-bindgen-amd64
ADD --checksum=sha256:82d12bb940e2d4e72e0d5605387fc1b8ca179044e012b620f0ce4e7440e8320e \
    https://github.com/wasm-bindgen/wasm-bindgen/releases/download/0.2.129/wasm-bindgen-0.2.129-x86_64-unknown-linux-musl.tar.gz \
    /wasm-bindgen.tar.gz
FROM scratch AS wasm-bindgen-arm64
ADD --checksum=sha256:1797c349a0f45d30946e8986b184135e12839ab576c9a04203e85febfc5dcb35 \
    https://github.com/wasm-bindgen/wasm-bindgen/releases/download/0.2.129/wasm-bindgen-0.2.129-aarch64-unknown-linux-gnu.tar.gz \
    /wasm-bindgen.tar.gz
FROM wasm-bindgen-${BUILDARCH} AS wasm-bindgen

# packages/core/pkg: the WebAssembly build of crates/core (ADR 0009), as packages/core's `build`.
FROM --platform=$BUILDPLATFORM rust:1.99.1-slim-trixie AS wasm
COPY --from=wasm-bindgen /wasm-bindgen.tar.gz /tmp/
RUN tar -xzf /tmp/wasm-bindgen.tar.gz --strip-components=1 -C /usr/local/bin --wildcards '*/wasm-bindgen'
WORKDIR /src
COPY Cargo.toml Cargo.lock rust-toolchain.toml ./
COPY crates crates
RUN cargo build --locked -p lr-core --features wasm --target wasm32-unknown-unknown --profile wasm \
 && wasm-bindgen --target web --out-dir /pkg target/wasm32-unknown-unknown/wasm/lr_core.wasm

# The chain on musl: crates/randomx's vectors, which prove the RandomX it links builds and hashes
# right on musl, then lr-node. CMake and the C++ compiler come from the image's Alpine release, at
# these versions; without linux-headers (asm/hwcap.h) RandomX quietly hashes with software AES on
# ARM.
FROM rust:1.99.1-alpine3.24 AS chain
RUN apk add --no-cache cmake~4.2 g++~15.2 make~4.4 linux-headers~7.0
WORKDIR /src
COPY Cargo.toml Cargo.lock rust-toolchain.toml ./
COPY crates crates
RUN cargo test --locked -p lr-randomx \
 && cargo build --locked --release -p lr-node --bin lr-node

# The wallet's pages.
FROM --platform=$BUILDPLATFORM node:26.12.1-alpine3.24 AS build
RUN npm install -g pnpm@11.3.0
WORKDIR /app
COPY . .
COPY --from=wasm /pkg packages/core/pkg
RUN pnpm install --frozen-lockfile
ARG VITE_NODE_URL=http://localhost:9445
ARG VITE_NETWORK=test
RUN pnpm --filter @dinhdu002/lr-wallet build \
 && node packages/wallet/scripts/caddy-headers.ts > packages/wallet/headers.caddy

FROM caddy:2.11.7-alpine AS wallet
COPY packages/wallet/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/packages/wallet/headers.caddy /etc/caddy/headers.caddy
COPY --from=build /app/packages/wallet/dist /srv

# Only the binary: no key is in this image. A Checkpoint signer's words are a secret file on its
# own machine (deploy/compose.signer.yaml). The chain lives in the /data volume, writable by the
# unprivileged user.
FROM alpine:3.24.3 AS lr-node
RUN install -d -o 10001 -g 10001 /data
COPY --from=chain /src/target/release/lr-node /usr/local/bin/lr-node
USER 10001:10001
ENTRYPOINT ["lr-node"]
CMD ["--data", "/data"]
