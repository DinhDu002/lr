import { expect, test, type Page } from "@playwright/test";
import { parseAmount, ready } from "@dinhdu002/lr-core";

// Development accounts 1 and 2 (compose.yaml): public keys, for the dev network only. The Mine
// rewards account 1.
const ACCOUNT_1 = {
  address: "tlr1qqqlh49v75au7t3xm6hq62p5awm7ajvvus4nnjuc0cjsfuk9cyzpqasflqyes",
  words:
    "absurd amount doctor acoustic avoid letter advice cage absurd amount doctor acoustic avoid letter advice cage absurd amount doctor acoustic avoid letter advice comic",
};
const ACCOUNT_2 = {
  address: "tlr1qqqm4t3jhxtg8aaj3tq6dj8ehqxvrrtggwg8zkzfrr7v4dlfy0gn33s2545g9",
  words:
    "acoustic avoid letter advice cage absurd amount doctor acoustic avoid letter advice cage absurd amount doctor acoustic avoid letter advice cage absurd amount exchange",
};
const PASSWORD = "correct horse battery";
const MEMO = "Lantern";

/** Restores `account` through Setup, unlocks the wallet and returns it open on its Gold. */
async function restore(page: Page, account: typeof ACCOUNT_1) {
  await page.goto("/setup.html");
  await page.getByRole("button", { name: "Restore from 24 words" }).click();
  const form = page.locator("#step-restore");
  await form.getByLabel("Your 24 words").fill(account.words);
  await form.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await form.getByLabel("Repeat the password").fill(PASSWORD);
  await form.getByRole("button", { name: "Restore account" }).click();
  await expect(page.locator("#done-address")).toHaveText(account.address);
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: "Unlock the wallet" });
  await dialog.getByLabel("Password").fill(PASSWORD);
  await dialog.getByRole("button", { name: "Unlock" }).click();
  await expect(page.locator("#account-address")).toHaveText(account.address);
}

/** The balance on the page, in base units (0 while it still shows "…"). */
async function balance(page: Page): Promise<bigint> {
  await ready;
  const text = (await page.locator("#balance").textContent()) ?? "";
  const gold = /^([\d.]+) GOLD$/.exec(text)?.[1];
  return gold ? parseAmount(gold) : 0n;
}

test("Mined Gold is sent with a memo from one account to another", async ({
  browser,
}) => {
  // Blocks come in seconds, and the wallet reads the Node every 10 seconds.
  test.setTimeout(180_000);
  const sender = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
  });
  const receiver = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
  });
  try {
    const page1 = await sender.newPage();
    const page2 = await receiver.newPage();
    await restore(page1, ACCOUNT_1);
    await restore(page2, ACCOUNT_2);
    await expect(page2.locator("#balance")).not.toHaveText("…");
    const before = await balance(page2);

    // The Mine rewards account 1.
    await expect
      .poll(() => balance(page1), { timeout: 120_000 })
      .toBeGreaterThan(0n);

    const form = page1.locator("#send-form");
    await form.getByLabel("Recipient address").fill(ACCOUNT_2.address);
    await form.getByLabel("Amount (GOLD)").fill("1.25");
    await form.getByLabel(/^Memo/).fill(MEMO);
    await form.getByRole("button", { name: "Send", exact: true }).click();
    const prompt = page1.getByRole("dialog", { name: "Send Gold" });
    await expect(prompt.locator("#pay-from")).toHaveText(ACCOUNT_1.address);
    await expect(prompt.locator("#pay-to")).toHaveText(ACCOUNT_2.address);
    await expect(prompt.locator("#pay-amount")).toHaveText("1.25 GOLD");
    await expect(prompt.locator("#pay-memo")).toHaveText(MEMO);
    // Approve answers only a real click, and only a second after the prompt opened.
    await page1.waitForTimeout(1200);
    await prompt.getByRole("button", { name: "Approve" }).click();
    await expect(prompt).toBeHidden();
    await expect(page1.locator("#send-status")).toContainText("Sent 1.25 GOLD");

    // Confirmed once a Block holds it.
    const sent = page1
      .locator("#transactions li")
      .filter({ hasText: `sent 1.25 GOLD to ${ACCOUNT_2.address}` });
    await expect(sent).toHaveCount(1);
    await expect(sent).toContainText(`memo "${MEMO}"`);
    await expect(sent).toContainText(/^Block #\d+ · sent/, { timeout: 60_000 });

    // The other account has it, with the memo.
    await expect
      .poll(() => balance(page2), { timeout: 60_000 })
      .toBe(before + parseAmount("1.25"));
    await expect(
      page2.locator("#transactions li").filter({
        hasText: `received 1.25 GOLD from ${ACCOUNT_1.address} · memo "${MEMO}"`,
      }),
    ).toHaveCount(1);
  } finally {
    await sender.close();
    await receiver.close();
  }
});
