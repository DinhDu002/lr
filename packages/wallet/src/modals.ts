// The wallet's own dialogs.
import { el } from "./dom.ts";

export type SignAnswer = "approved" | "denied" | "busy";

export const APPROVE_DELAY_MS = 1000;

/** What the payment prompt shows, each line already written as the Player reads it. */
export interface PaymentView {
  from: string;
  to: string;
  amount: string;
  /** Escaped (src/escape.ts). */
  memo: string;
  fee: string;
  total: string;
}

export function createModals() {
  let open = 0;
  const hold = () => open++;
  const release = () => open--;

  /** Opens `dialog` modally; resolves with its return value ("" when closed with Escape). */
  function show(dialog: HTMLDialogElement): Promise<string> {
    return new Promise((resolve) => {
      hold();
      dialog.addEventListener(
        "close",
        () => {
          release();
          resolve(dialog.returnValue);
        },
        { once: true },
      );
      dialog.returnValue = "";
      dialog.showModal();
    });
  }

  // One prompt at a time: a second request must not change the text under an Approve button that
  // is already armed. Its state ends the moment it is answered, not when the browser later fires
  // `close`.
  let finishPrompt: ((value: string) => void) | undefined;

  /**
   * Shows a prompt whose fields are filled. Approve is not focused and answers only a real pointer
   * click (a keyboard or scripted click has `detail` 0), and only a second after the prompt opened.
   * Deny and closing both answer "denied". `clear` empties what the prompt showed.
   */
  function armedPrompt(
    dialog: HTMLDialogElement,
    approve: HTMLElement,
    clear: () => void,
  ): Promise<SignAnswer> {
    return new Promise((resolve) => {
      const openedAt = Date.now();
      approve.setAttribute("aria-disabled", "true");
      const ready = setTimeout(
        () => approve.removeAttribute("aria-disabled"),
        APPROVE_DELAY_MS,
      );
      const finish = (value: string) => {
        if (finishPrompt !== finish) return; // answered already
        finishPrompt = undefined;
        clearTimeout(ready);
        approve.removeEventListener("click", onClick);
        dialog.removeEventListener("close", onClose);
        clear();
        if (dialog.open) dialog.close();
        release();
        resolve(value === "approve" ? "approved" : "denied");
      };
      const onClick = (event: MouseEvent) => {
        if (
          event.isTrusted &&
          event.detail > 0 &&
          Date.now() - openedAt >= APPROVE_DELAY_MS
        )
          finish("approve");
      };
      // Deny or Escape. A `close` the browser fires late for an earlier prompt finds the dialog
      // open again and is ignored.
      const onClose = () => {
        if (!dialog.open) finish(dialog.returnValue);
      };
      finishPrompt = finish;
      approve.addEventListener("click", onClick);
      dialog.addEventListener("close", onClose);
      hold();
      dialog.returnValue = "";
      dialog.showModal();
    });
  }

  /**
   * The payment prompt: every line is the wallet's own, with the full recipient address.
   */
  function confirmPayment(payment: PaymentView): Promise<SignAnswer> {
    if (finishPrompt) return Promise.resolve("busy");
    const fields = {
      "pay-from": payment.from,
      "pay-to": payment.to,
      "pay-amount": payment.amount,
      "pay-memo": payment.memo,
      "pay-fee": payment.fee,
      "pay-total": payment.total,
    };
    for (const [id, text] of Object.entries(fields)) el(id).textContent = text;
    return armedPrompt(el<HTMLDialogElement>("pay"), el("pay-approve"), () => {
      for (const id of Object.keys(fields)) el(id).textContent = "";
    });
  }

  return {
    show,
    confirmPayment,
    get isOpen() {
      return open > 0;
    },
  };
}

export type Modals = ReturnType<typeof createModals>;
