import { test as base, expect, type Page } from "@playwright/test";
import { WALLET_ORIGIN } from "./ports.ts";

export { expect };

export const PASSWORD = "correct horse battery";

/** Runs Setup's "Create a new account"; returns its address and its 24 words. */
export async function createAccount(
  page: Page,
  password = PASSWORD,
): Promise<{ address: string; words: string[] }> {
  await page.goto("/setup.html");
  await page.getByRole("button", { name: "Create a new account" }).click();
  const words = await page.locator("#words li").allTextContents();
  expect(words).toHaveLength(24);
  await page.getByRole("button", { name: "I wrote them down" }).click();
  for (const label of await page.locator("#confirm-fields label").all()) {
    const n = Number(/#(\d+)/.exec((await label.textContent()) ?? "")![1]);
    await page.getByLabel(`Word #${n}`, { exact: true }).fill(words[n - 1]!);
  }
  const form = page.locator("#step-confirm");
  await form.getByLabel("Password", { exact: true }).fill(password);
  await form.getByLabel("Repeat the password").fill(password);
  await form.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator("#done")).toBeVisible();
  return {
    address: (await page.locator("#done-address").textContent())!,
    words,
  };
}

export function unlockDialog(page: Page) {
  return page.getByRole("dialog", { name: "Unlock the wallet" });
}

export async function unlock(page: Page, password = PASSWORD) {
  const dialog = unlockDialog(page);
  await dialog.getByLabel("Password").fill(password);
  await dialog.getByRole("button", { name: "Unlock" }).click();
  await expect(dialog).toBeHidden();
}

/** Opens the wallet and unlocks it. */
export async function openWallet(page: Page) {
  await page.goto("/");
  await unlock(page);
  await expect(page.locator("#view-home")).toBeVisible();
}

/** An account made once per worker and stored in each test's browser, so tests do not wait for Setup. */
export const test = base.extend<
  object,
  {
    account: {
      address: string;
      state: Awaited<ReturnType<ReturnType<Page["context"]>["storageState"]>>;
    };
  }
>({
  account: [
    async ({ browser }, use) => {
      const context = await browser.newContext({ baseURL: WALLET_ORIGIN });
      const page = await context.newPage();
      const { address } = await createAccount(page);
      const state = await context.storageState({ indexedDB: true });
      await context.close();
      await use({ address, state });
    },
    { scope: "worker" },
  ],
  storageState: async ({ account }, use) => use(account.state),
});

/** Tests that start from an empty browser. */
export const plain = base;
