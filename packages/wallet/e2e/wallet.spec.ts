import type { Page } from "@playwright/test";
import { accountKey } from "@dinhdu002/lr-core";
import {
  expect,
  openWallet,
  PASSWORD,
  test,
  unlock,
  unlockDialog,
} from "./fixtures.ts";
import { NODE_URL } from "./ports.ts";
import type { SentTransfer } from "./node-stub.ts";

/** An account that never signs in: the address the tests pay. */
const RECIPIENT = accountKey(new Uint8Array(32).fill(8), 0).address;

/** The transfers the Node stub holds from one sender. */
async function nodeSent(sender: string): Promise<SentTransfer[]> {
  const sent = (await (
    await fetch(`${NODE_URL}/__sent`)
  ).json()) as SentTransfer[];
  return sent.filter((t) => t.sender === sender);
}

const payPrompt = (page: Page) =>
  page.getByRole("dialog", { name: "Send Gold" });

async function fillSend(page: Page, fields: Record<string, string>) {
  const form = page.locator("#send-form");
  await form.getByLabel("Recipient address").fill(fields.to ?? RECIPIENT);
  await form.getByLabel("Amount (GOLD)").fill(fields.amount ?? "1.5");
  await form.getByLabel(/^Memo/).fill(fields.memo ?? "Lantern");
  await form.getByRole("button", { name: "Send", exact: true }).click();
}

test.describe("Gold", () => {
  test("shows the address and the balance the Node reports", async ({
    page,
    account,
  }) => {
    await openWallet(page);
    await expect(page.locator("#account-address")).toHaveText(account.address);
    await expect(page.locator("#balance")).toHaveText("10 GOLD");
    await expect(page.locator("#transactions")).toHaveText(
      "No transactions yet.",
    );
  });

  test("copies the address", async ({ page, context, account }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openWallet(page);
    await page.getByRole("button", { name: "Copy address" }).click();
    await expect(page.locator("#copy-address")).toHaveText("Copied");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      account.address,
    );
  });

  test("shows the payment prompt; nothing is sent until Approve is clicked", async ({
    page,
    account,
  }) => {
    await page.clock.install();
    await openWallet(page);
    const before = (await nodeSent(account.address)).length;
    await fillSend(page, {});
    const prompt = payPrompt(page);
    await expect(prompt).toBeVisible();

    // The prompt's rows are the wallet's own. A first transaction carries the public key:
    // 2,517 + 7 + 1,312 bytes at 10 a byte.
    await expect(prompt.locator("#pay-from")).toHaveText(account.address);
    await expect(prompt.locator("#pay-to")).toHaveText(RECIPIENT);
    await expect(prompt.locator("#pay-amount")).toHaveText("1.5 GOLD");
    await expect(prompt.locator("#pay-memo")).toHaveText("Lantern");
    await expect(prompt.locator("#pay-fee")).toHaveText("0.0003836 GOLD");
    await expect(prompt.locator("#pay-total")).toHaveText("1.5003836 GOLD");

    // An early click, the keyboard and a script's click do nothing.
    const approve = prompt.getByRole("button", { name: "Approve" });
    await expect(approve).not.toBeFocused();
    await page.clock.pauseAt(new Date(Date.now() + 100));
    await approve.click({ force: true });
    await page.keyboard.press("Enter");
    await page.clock.runFor(1500);
    await approve.focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Space");
    await approve.evaluate((b) => (b as HTMLElement).click());
    await page.waitForTimeout(300);
    expect(await nodeSent(account.address)).toHaveLength(before);
    await expect(prompt).toBeVisible();

    await approve.click();
    await expect(prompt).toBeHidden();
    await expect(page.locator("#send-status")).toContainText("Sent 1.5 GOLD");
    const sent = (await nodeSent(account.address)).slice(before);
    expect(sent).toEqual([
      {
        id: expect.stringMatching(/^[0-9a-f]{64}$/),
        sender: account.address,
        to: RECIPIENT,
        amount: "150000000",
        fee: "38360",
        memo: "Lantern",
      },
    ]);
    // Waiting until a Block holds it.
    await expect(page.locator("#transactions li").first()).toContainText(
      `waiting for a Block · sent 1.5 GOLD to ${RECIPIENT}`,
    );
  });

  test("Deny and Escape send nothing", async ({ page, account }) => {
    await openWallet(page);
    const before = (await nodeSent(account.address)).length;
    await fillSend(page, {});
    await payPrompt(page).getByRole("button", { name: "Deny" }).click();
    await expect(payPrompt(page)).toBeHidden();
    await expect(page.locator("#send-status")).toHaveText(
      "Not sent: nothing was signed.",
    );
    await fillSend(page, {});
    await expect(payPrompt(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(payPrompt(page)).toBeHidden();
    expect(await nodeSent(account.address)).toHaveLength(before);
  });

  test("shows a memo's hidden characters as escapes", async ({ page }) => {
    await openWallet(page);
    await fillSend(page, { memo: "a‮b" });
    await expect(payPrompt(page).locator("#pay-memo")).toHaveText(
      "a\\u{202e}b",
    );
  });

  test("refuses what is not well formed, with no prompt", async ({ page }) => {
    await openWallet(page);
    const status = page.locator("#send-status");
    await fillSend(page, { to: "tlr1x" });
    await expect(status).toContainText("not an LR address");
    await fillSend(page, { amount: "0" });
    await expect(status).toContainText("more than 0");
    await fillSend(page, { memo: "é".repeat(41) });
    await expect(status).toContainText("at most 80 bytes");
    await expect(payPrompt(page)).toBeHidden();
  });
});

test.describe("locking", () => {
  test("Lock hides the account; Unlock asks for the password, and a wrong one stays locked", async ({
    page,
  }) => {
    await openWallet(page);
    await page.getByRole("button", { name: "Lock" }).click();
    await expect(page.locator("#view-home")).toBeHidden();
    await expect(
      page.getByRole("heading", { name: "The wallet is locked" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Unlock" }).click();
    const dialog = unlockDialog(page);
    await dialog.getByLabel("Password").fill("wrong wrong");
    await dialog.getByRole("button", { name: "Unlock" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Wrong password.");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Password").fill(PASSWORD);
    await dialog.getByRole("button", { name: "Unlock" }).click();
    await expect(page.locator("#view-home")).toBeVisible();
  });

  test("locks after 15 minutes without input on the wallet's page", async ({
    page,
  }) => {
    await page.clock.install();
    await openWallet(page);
    await page.clock.fastForward("14:00");
    await expect(page.getByRole("button", { name: "Lock" })).toBeVisible();
    await page.mouse.move(10, 10); // input restarts the idle timer
    await page.clock.fastForward("14:00");
    await expect(page.getByRole("button", { name: "Lock" })).toBeVisible();
    await page.clock.fastForward("01:30");
    await expect(page.getByRole("button", { name: "Unlock" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "The wallet is locked" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Unlock" }).click();
    await unlock(page);
  });
});

test.describe("the page", () => {
  test("links the web app manifest for the Home Screen", async ({ page }) => {
    await page.goto("/");
    const href = await page
      .locator('link[rel="manifest"]')
      .getAttribute("href");
    const response = await page.request.get(href!);
    expect(response.ok()).toBe(true);
    expect(await response.json()).toMatchObject({
      start_url: "/",
      display: "standalone",
    });
  });

  test("serves the wallet with the CSP and COOP headers", async ({ page }) => {
    const response = (await page.goto("/"))!;
    const headers = response.headers();
    expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
    const csp = headers["content-security-policy"]!;
    expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(csp).toContain("connect-src 'self' http://localhost:8794");
    expect(csp).not.toContain("frame-src");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'none'");
  });
});
