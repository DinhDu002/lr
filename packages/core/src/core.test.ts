import {
  createHash,
  createPrivateKey,
  createPublicKey,
  hkdfSync,
  pbkdf2Sync,
  randomBytes,
  verify as nodeVerify,
} from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_SALT,
  Key,
  SCHEME_ML_DSA_44,
  accountKey,
  addressFromPublicKey,
  entropyFromWords,
  isAddress,
  verify,
  wordsFromEntropy,
} from "./node.ts";

interface Identity {
  accounts: {
    entropy: string;
    words: string;
    seed: string;
    index: number;
    salt: string;
    info: string;
    xi: string;
    publicKey: string;
    address: string;
  }[];
  invalidAddresses: { reason: string; address: string }[];
}

const vectors = JSON.parse(
  readFileSync(
    new URL("../../../crates/core/test-vectors/identity.json", import.meta.url),
    "utf8",
  ),
) as Identity;

const bytes = (hex: string) => new Uint8Array(Buffer.from(hex, "hex"));
const hex = (data: Uint8Array) => Buffer.from(data).toString("hex");
const utf8 = (text: string) => new TextEncoder().encode(text);

// The Bech32m payload without its checksum, decoded independently of the WASM build.
function addressPayload(address: string): Uint8Array {
  const charset = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
  const words = [...address.slice(4, -6)].map((c) => charset.indexOf(c));
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const word of words) {
    acc = (acc << 5) | word;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

// Node's own ML-DSA-44, as a second implementation.
const nodePublicKey = (xi: Uint8Array) =>
  createPublicKey(
    createPrivateKey({
      key: xi,
      format: "raw-seed",
      asymmetricKeyType: "ml-dsa-44",
    }),
  ).export({ format: "raw-public" });

const nodeVerifies = (
  publicKey: Uint8Array,
  context: string,
  message: Uint8Array,
  signature: Uint8Array,
) =>
  nodeVerify(
    null,
    message,
    {
      key: createPublicKey({
        key: publicKey,
        format: "raw-public",
        asymmetricKeyType: "ml-dsa-44",
      }),
      context: utf8(context),
    },
    signature,
  );

describe("identity vectors", () => {
  it.each(vectors.accounts)("derives the key of $entropy under $info", (c) => {
    expect(wordsFromEntropy(bytes(c.entropy))).toBe(c.words);
    expect(hex(entropyFromWords(c.words))).toBe(c.entropy);

    const seed = pbkdf2Sync(
      c.words.normalize("NFKD"),
      "mnemonic",
      2048,
      64,
      "sha512",
    );
    expect(seed.toString("hex")).toBe(c.seed);
    const xi = hkdfSync("sha512", seed, c.salt, c.info, 32);
    expect(Buffer.from(xi).toString("hex")).toBe(c.xi);
    expect(hex(nodePublicKey(new Uint8Array(xi)))).toBe(c.publicKey);

    using key = Key.fromEntropy(bytes(c.entropy), c.salt, c.info);
    expect(hex(key.publicKey)).toBe(c.publicKey);
    expect(key.address).toBe(c.address);
    expect(addressFromPublicKey(SCHEME_ML_DSA_44, bytes(c.publicKey))).toBe(
      c.address,
    );

    const hash = createHash("keccak-256")
      .update(Buffer.from([SCHEME_ML_DSA_44]))
      .update(bytes(c.publicKey))
      .digest("hex");
    expect(hex(addressPayload(c.address))).toBe(`0001${hash}`);
    expect(isAddress(c.address)).toBe(true);
  });

  it("derives account indexes with LR's labels", () => {
    for (const c of vectors.accounts) {
      using key = accountKey(bytes(c.entropy), c.index);
      expect(c.salt).toBe(ACCOUNT_SALT);
      expect(c.info).toBe(`account/${c.index}`);
      expect(hex(key.publicKey)).toBe(c.publicKey);
      expect(key.address).toBe(c.address);
    }
    const entropy = bytes(vectors.accounts[0]!.entropy);
    for (const index of [-1, 1.5, NaN, 2 ** 32]) {
      expect(() => accountKey(entropy, index)).toThrow(
        "index is not an integer in range",
      );
    }
  });

  it("signs and verifies as an account", () => {
    const c = vectors.accounts[0]!;
    using key = accountKey(bytes(c.entropy), c.index);
    const message = utf8("lr");
    const signature = key.sign("lr/test/v1", message, new Uint8Array(32));
    expect(
      verify(SCHEME_ML_DSA_44, key.publicKey, "lr/test/v1", message, signature),
    ).toBe(true);
    expect(
      verify(
        SCHEME_ML_DSA_44,
        key.publicKey,
        "lr/other/v1",
        message,
        signature,
      ),
    ).toBe(false);
    expect(nodeVerifies(key.publicKey, "lr/test/v1", message, signature)).toBe(
      true,
    );
  });
});

describe("addresses", () => {
  it.each(vectors.invalidAddresses)("refuses $reason", ({ address }) => {
    expect(isAddress(address)).toBe(false);
  });
});

describe("keys", () => {
  it("signs with fresh randomness, and Node verifies it", () => {
    using key = Key.fromSeed(randomBytes(32));
    const message = utf8("lr test");
    const a = key.sign("lr/test/v1", message, randomBytes(32));
    const b = key.sign("lr/test/v1", message, randomBytes(32));
    expect(hex(a)).not.toBe(hex(b));
    expect(
      verify(SCHEME_ML_DSA_44, key.publicKey, "lr/test/v1", message, b),
    ).toBe(true);
    expect(nodeVerifies(key.publicKey, "lr/test/v1", message, b)).toBe(true);
    const flipped = b.slice();
    flipped[0]! ^= 1;
    expect(
      verify(SCHEME_ML_DSA_44, key.publicKey, "lr/test/v1", message, flipped),
    ).toBe(false);
    expect(verify(2, key.publicKey, "lr/test/v1", message, b)).toBe(false);
  });

  it("refuses malformed input", () => {
    expect(() => Key.fromSeed(new Uint8Array(31))).toThrow("expected 32 bytes");
    expect(() => entropyFromWords("abandon abandon")).toThrow(
      "not 24 valid words",
    );
    const address = vectors.accounts[0]!.address;
    expect(isAddress(address.toUpperCase())).toBe(false);
    expect(
      isAddress(`${address.slice(0, -1)}${address.endsWith("q") ? "p" : "q"}`),
    ).toBe(false);
    expect(() => addressFromPublicKey(2, new Uint8Array(1312))).toThrow(
      "unknown signature scheme",
    );
    // Out of range, not taken modulo 2^8: scheme 257 is not 1.
    expect(() => addressFromPublicKey(257, new Uint8Array(1312))).toThrow(
      "scheme is not an integer in range",
    );
    using key = accountKey(bytes(vectors.accounts[0]!.entropy), 0);
    const message = utf8("lr");
    const signature = key.sign("lr/test/v1", message, new Uint8Array(32));
    const verifyAs = (scheme: number) =>
      verify(scheme, key.publicKey, "lr/test/v1", message, signature);
    expect([
      verifyAs(SCHEME_ML_DSA_44),
      verifyAs(SCHEME_ML_DSA_44 + 256),
    ]).toEqual([true, false]);
  });
});
