// The unlocked account: its key (inside the WebAssembly module), in memory only. Locking frees the
// key and wipes the decrypted bytes. Limit: the password string and the browser's own copies
// cannot be wiped from JavaScript.
import { accountKey, type Key } from "@dinhdu002/lr-core";
import { openEntropy, type KeyRecord } from "./keystore.ts";

export const IDLE_LOCK_MS = 15 * 60 * 1000;

export class LockedError extends Error {
  override name = "LockedError";
  constructor() {
    super("The wallet is locked");
  }
}

export type SigningKey = Key;

export interface VaultOptions {
  idleMs?: number;
  /** True while the wallet shows a prompt, so the idle timer waits instead of locking. */
  isBusy?: () => boolean;
  /** Account 0 of the entropy: the Player's own. */
  deriveKey?: (entropy: Uint8Array) => SigningKey;
  open?: (record: KeyRecord, password: string) => Promise<Uint8Array>;
}

export interface Vault {
  readonly address: string;
  readonly unlocked: boolean;
  /** Throws WrongPasswordError. */
  unlock(password: string): Promise<void>;
  lock(): void;
  /** Restarts the idle timer; called for input on the wallet's own page. */
  touch(): void;
  /** Runs `use` with the key, or throws LockedError. Do not keep the key. */
  withKey<T>(use: (key: SigningKey) => T): T;
  onChange(listener: () => void): void;
}

export function createVault(
  record: KeyRecord,
  {
    idleMs = IDLE_LOCK_MS,
    isBusy = () => false,
    deriveKey = (entropy) => accountKey(entropy, 0),
    open = openEntropy,
  }: VaultOptions = {},
): Vault {
  let key: SigningKey | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners: (() => void)[] = [];
  const changed = () => listeners.forEach((l) => l());

  function lock() {
    clearTimeout(timer);
    if (!key) return;
    key.free();
    key = undefined;
    changed();
  }

  function touch() {
    if (!key) return;
    clearTimeout(timer);
    timer = setTimeout(() => (isBusy() ? touch() : lock()), idleMs);
  }

  return {
    address: record.address,
    get unlocked() {
      return key !== undefined;
    },
    async unlock(password) {
      const entropy = await open(record, password);
      let derived: SigningKey;
      try {
        derived = deriveKey(entropy);
      } finally {
        entropy.fill(0);
      }
      if (key || derived.address !== record.address) {
        derived.free();
        if (key) return;
        throw new Error("The stored key does not match its address");
      }
      key = derived;
      touch();
      changed();
    },
    lock,
    touch,
    withKey(use) {
      if (!key) throw new LockedError();
      return use(key);
    },
    onChange: (listener) => void listeners.push(listener),
  };
}
