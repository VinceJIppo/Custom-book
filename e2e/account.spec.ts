import { expect, test } from "@playwright/test";

/**
 * The Account page and the delete form's safety check. The e2e user is shared by every
 * test, so this never actually deletes it (the delete itself is covered in tests/delete-account.test.ts).
 */
test("the account page explains deleting and refuses a mistyped email", async ({ page }) => {
  await page.goto("/");
  if (page.url().includes("/welcome")) {
    await page.getByLabel("I am 18 or older.").check();
    await page.getByRole("button", { name: "Continue" }).click();
  }
  // Reachable from the menu (opened first on phones).
  const menu = page.getByRole("button", { name: /menu/i });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("link", { name: "Account", exact: true }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Account" })).toBeVisible();
  const email = (await page.getByTestId("account-email").innerText()).trim();
  expect(email).toContain("@");
  await expect(page.getByRole("heading", { name: "Delete your account" })).toBeVisible();
  await expect(page.getByText("What we delete")).toBeVisible();

  // Open print orders from other tests may block deleting; then the form isn't offered at all.
  if (await page.getByTestId("delete-blocked").isVisible()) return;
  await page.getByTestId("confirm-email").fill(`not-${email}`);
  await page.getByTestId("delete-account").click();
  await expect(page.locator("main").getByRole("alert")).toContainText("didn't match, so nothing was deleted");
  await expect(page.getByTestId("account-email")).toHaveText(email);
});
