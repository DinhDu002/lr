# Identity: keys and addresses

Status: mandatory (ADR 0009, ADR 0016). Every Node, wallet and application implements this exactly. The reference implementation is `crates/core` (keys, signatures, addresses), and `packages/core` (`@dinhdu002/lr-core`) for TypeScript.

## Keys

**Scheme 1: ML-DSA-44** (FIPS 204).
- Public keys are `pkEncode` (1,312 bytes) and signatures are `sigEncode` (2,420 bytes).
- Signing uses the pure, external interface `ML-DSA.Sign(sk, M, ctx)`, where the context `ctx` is the ASCII string of what is signed: `lr/tx/v1` for a transaction and `lr/checkpoint/v1` for a Checkpoint (`transactions.md`, `blocks.md`).
- Signing is hedged: 32 fresh random bytes per signature. A verifier cannot tell the difference, and deterministic signatures still verify.

**A key from 24 words.** LR derives a key from 24 words under a `salt` and an `info` that the application chooses (ADR 0016):
1. `entropy`: 32 random bytes.
2. The words: BIP-39 over `entropy`, using the English word list and its 8-bit checksum.
3. `seed`: the BIP-39 seed, PBKDF2-HMAC-SHA512 over the NFKD-normalised words with the salt `"mnemonic"` and an empty passphrase, 2048 rounds, 64 bytes.
4. `xi = HKDF-SHA512(salt, ikm = seed, info, length = 32)`.
5. `(pk, sk) = ML-DSA-44.KeyGen_internal(xi)`, the key generation from a seed in FIPS 204.

**An Account's key (LR's wallet).** LR's own labels are the salt `"lr/ml-dsa-44/v1"` and the info `"account/" + index`. `index` is a decimal number from `0` to `2^32 - 1` without leading zeros; a wallet's first Account is index `0`. `accountKey(entropy, index)` in `@dinhdu002/lr-core` derives it (`ACCOUNT_SALT` is the salt).

**An application's own labels.** The salt and info are parameters, so an application may choose its own; the same 24 words then give a different key and address under each pair. Linked Realms' Characters use their own labels, which live in its repository, so a Character's address is not the wallet's address for the same words.

**Other keys.** A key that no person keeps in words, such as a service's, is generated from 32 random bytes of `xi` and stored where it runs. It is never derived from words.

## Addresses

An address is Bech32m (BIP-350) with the human-readable part `tlr` (the test network) over a 34-byte payload:

| Bytes | Field |
|---|---|
| 0 | version, `0` |
| 1 | scheme id, `1` for ML-DSA-44 |
| 2–33 | `keccak256(scheme id ‖ public key)` |

- keccak256 is the original Keccak with 256-bit output, the variant Ethereum uses, not SHA3-256.
- An address is always written in lowercase and is about 65 characters long, starting with `tlr1`. Readers reject uppercase, mixed case, another prefix, a Bech32 (not Bech32m) checksum, a bad checksum, a payload of another length, an unknown version, an unknown scheme, or non-zero padding bits in the last 5-bit group. The simplest correct check is to decode, encode again and compare the strings.
- Two addresses are equal exactly when their strings are equal.
- When space is short, show `tlr1`, then the first six characters after `tlr1`, `…`, and the last six characters. The first characters after `tlr1` are the same for every scheme-1 address, so they are not enough on their own.

## Test vectors

- `crates/core/test-vectors/identity.json`: words, the seed, the salt and info, `xi`, the public key and the address for several entropies and indexes, and one invalid address for each rule above. The `accounts` entries use LR's labels.
