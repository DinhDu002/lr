// The API both entry points share. Keys are ML-DSA-44 (docs/protocols/identity.md); call
// `Key.free()` when done so the private key is wiped. `sign`, `signTransfer` and `signRotation`
// take 32 fresh random bytes as `rnd`. Transactions (docs/protocols/transactions.md) take a
// network id and amounts in base units, as `bigint`.
import { Key } from "../pkg/lr_core.js";

export {
  Key,
  addressFromBytes,
  addressFromPublicKey,
  addressToBytes,
  entropyFromWords,
  formatAmount,
  isAddress,
  parseAmount,
  transactionId,
  verify,
  wordsFromEntropy,
} from "../pkg/lr_core.js";

/** Scheme id of ML-DSA-44 in addresses. */
export const SCHEME_ML_DSA_44 = 1;

/** LR's own HKDF salt for its wallets' keys; an application may choose its own (ADR 0016, 0017). */
export const ACCOUNT_SALT = "lr/ml-dsa-44/v1";

/** Account `index` behind the entropy of 24 words. Call `free()` on the key when done. */
export function accountKey(entropy: Uint8Array, index: number): Key {
  // Out of range, not taken modulo 2^32: index 2^32 + 1 is not account 1.
  if (!Number.isInteger(index) || index < 0 || index > 0xffff_ffff) {
    throw new RangeError("index is not an integer in range");
  }
  return Key.fromEntropy(entropy, ACCOUNT_SALT, `account/${index}`);
}
