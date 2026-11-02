import { formatAmount, ready } from "@dinhdu002/lr-core";
import { network, networkIdOf, nodeUrl } from "./config.ts";
import { el, make } from "./dom.ts";
import {
  describeTransaction,
  memoText,
  preparePayment,
  signPayment,
  type Payment,
} from "./gold.ts";
import { loadRecord, WrongPasswordError } from "./keystore.ts";
import { errorText, sendErrorText } from "./messages.ts";
import { createModals, type PaymentView } from "./modals.ts";
import {
  createNodeClient,
  NodeError,
  toHex,
  type PlacedTransaction,
} from "./node.ts";
import { createVault } from "./vault.ts";

const POLL_MS = 10_000;

async function main() {
  const viewNoAccount = el("view-no-account");
  const viewLocked = el("view-locked");
  const viewHome = el("view-home");

  const record = await loadRecord();
  if (!record) {
    viewNoAccount.hidden = false;
    return;
  }
  await ready;

  const node = createNodeClient(nodeUrl);
  const networkId = networkIdOf(network);
  const modals = createModals();
  const vault = createVault(record, { isBusy: () => modals.isOpen });
  const address = record.address;

  // --- Unlocking: the password is asked only here, in the wallet's own modal ---

  const unlockDialog = el<HTMLDialogElement>("unlock");
  const passwordInput = el<HTMLInputElement>("password");
  const unlockError = el("unlock-error");
  const unlockSubmit = el<HTMLButtonElement>("unlock-submit");
  let unlocking: Promise<boolean> | undefined;

  el("unlock-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    unlockSubmit.disabled = true;
    unlockError.textContent = "Unlocking…";
    try {
      // The page may pause for about a second: Argon2id runs on this thread.
      await new Promise((r) => setTimeout(r, 0));
      await vault.unlock(passwordInput.value);
      passwordInput.value = "";
      unlockDialog.close("unlocked");
    } catch (e) {
      unlockError.textContent =
        e instanceof WrongPasswordError ? "Wrong password." : errorText(e);
    } finally {
      unlockSubmit.disabled = false;
    }
  });
  el("unlock-cancel").addEventListener("click", () =>
    unlockDialog.close("cancel"),
  );

  /** True once the wallet is unlocked, asking for the password if needed; false when cancelled. */
  function ensureUnlocked(): Promise<boolean> {
    if (vault.unlocked) return Promise.resolve(true);
    unlocking ??= (async () => {
      unlockError.textContent = "";
      passwordInput.value = "";
      const result = await modals.show(unlockDialog);
      passwordInput.value = "";
      return result === "unlocked";
    })().finally(() => (unlocking = undefined));
    return unlocking;
  }

  // --- The bar and the views ---

  function render() {
    const locked = !vault.unlocked;
    viewLocked.hidden = !locked;
    viewHome.hidden = locked;
    el("lock").hidden = locked;
    el("unlock-button").hidden = !locked;
  }

  el("lock").addEventListener("click", () => vault.lock());
  el("unlock-button").addEventListener("click", () => void ensureUnlocked());
  vault.onChange(() => {
    render();
    if (vault.unlocked) void refreshGold();
  });
  for (const type of [
    "pointerdown",
    "pointermove",
    "keydown",
    "wheel",
    "touchstart",
  ])
    document.addEventListener(type, () => vault.touch(), {
      capture: true,
      passive: true,
    });

  // --- The account: its address ---

  el("account-address").textContent = address;
  const copyButton = el("copy-address");
  const copyLabel = copyButton.textContent;
  copyButton.addEventListener("click", async () => {
    await navigator.clipboard.writeText(address);
    copyButton.textContent = "Copied";
    setTimeout(() => (copyButton.textContent = copyLabel), 1500);
  });

  // --- Gold: balance, send and recent transactions, from the Public node ---

  const sendForm = el<HTMLFormElement>("send-form");
  const sendStatus = el("send-status");
  const sendSubmit = el<HTMLButtonElement>("send-submit");
  const goldStatus = el("gold-status");
  const field = (id: string) => el<HTMLInputElement>(id);
  // ponytail: sends wait here only until the page reloads; after that they show in the list once a
  // Block holds them.
  const pending = new Map<string, PlacedTransaction>();

  const gold = (units: bigint) => `${formatAmount(units)} GOLD`;

  /** The payment prompt's lines. */
  const paymentView = (payment: Payment): PaymentView => ({
    from: address,
    to: payment.to,
    amount: gold(payment.amount),
    memo: payment.memo.length === 0 ? "(none)" : memoText(payment.memo),
    fee: gold(payment.fee),
    total: gold(payment.amount + payment.fee),
  });

  /**
   * Signs `payment` and sends it. `answered` is false when the Node's answer was lost: the send
   * may have reached it. Throws the Node's refusal, and LockedError if the wallet locked.
   */
  async function signAndSend(
    payment: Payment,
  ): Promise<{ id: string; answered: boolean }> {
    const { bytes, id } = vault.withKey((key) => signPayment(key, payment));
    // Tracked before it leaves: if the Node's answer is lost, the list still shows whether the
    // Node holds it, so the Player does not pay twice by sending again.
    pending.set(id, {
      tx: {
        id,
        sender: address,
        nonce: Number(payment.nonce),
        fee: payment.fee.toString(),
        kind: "transfer",
        to: payment.to,
        amount: payment.amount.toString(),
        memo: toHex(payment.memo),
      },
      block: null,
    });
    try {
      await node.send(bytes);
      return { id, answered: true };
    } catch (e) {
      // A JSON-RPC error is the Node's refusal; anything else may have reached it.
      if (e instanceof NodeError && e.code < 0) {
        pending.delete(id);
        throw e;
      }
      return { id, answered: false };
    }
  }

  sendForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    sendSubmit.disabled = true;
    sendStatus.textContent = "Reading your account…";
    try {
      const payment = await preparePayment(node, networkId, address, {
        to: field("send-to").value.trim(),
        amount: field("send-amount").value.trim(),
        memo: field("send-memo").value,
        fee: field("send-fee").value.trim(),
      });
      sendStatus.textContent = "";
      if ((await modals.confirmPayment(paymentView(payment))) !== "approved") {
        sendStatus.textContent = "Not sent: nothing was signed.";
        return;
      }
      const { answered } = await signAndSend(payment);
      sendForm.reset();
      sendStatus.textContent = answered
        ? `Sent ${gold(payment.amount)}. It is confirmed once a Block holds it.`
        : "The Node did not answer, so the wallet cannot tell whether it was sent. It shows below as waiting while the Node holds it: check there before sending again.";
      void refreshGold();
    } catch (e) {
      sendStatus.textContent = sendErrorText(e);
    } finally {
      sendSubmit.disabled = false;
    }
  });

  let refreshes = 0;
  async function refreshGold() {
    const turn = ++refreshes;
    try {
      // The waiting sends first: one a Block took meanwhile is in the list read after.
      const checked = await Promise.all(
        [...pending.keys()].map(
          async (id) => [id, await node.transaction(id)] as const,
        ),
      );
      const [mine, recent] = await Promise.all([
        node.account(address),
        node.addressTxs(address),
      ]);
      if (turn !== refreshes) return; // a later refresh shows newer answers
      // A send stops waiting once a Block holds it, or the Node no longer has it.
      for (const [id, found] of checked) {
        if (found?.block || !found) pending.delete(id);
        if (!found)
          sendStatus.textContent =
            "A send left the Node without a Block: check the recent transactions, and send it again if it is not there.";
      }
      el("balance").textContent = `${formatAmount(mine?.balance ?? 0n)} GOLD`;
      const list = el("transactions");
      list.replaceChildren();
      const rows = [...pending.values(), ...recent];
      if (rows.length === 0) list.append(make("li", "No transactions yet."));
      for (const placed of rows)
        list.append(make("li", describeTransaction(placed, address)));
      goldStatus.textContent = "";
    } catch (e) {
      goldStatus.textContent = `Cannot read Gold from the Node at ${nodeUrl}: ${errorText(e)}`;
    }
  }

  setInterval(() => vault.unlocked && void refreshGold(), POLL_MS);

  render();
  void ensureUnlocked();
}

main().catch((e) => {
  el("status").textContent = errorText(e);
});
