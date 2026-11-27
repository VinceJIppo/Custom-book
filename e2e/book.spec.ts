import { expect, test } from "@playwright/test";

test("create a profile, pick a theme, and read a 16-page book in the flipbook", async ({ page }) => {
  await page.goto("/");
  if (page.url().includes("/welcome")) {
    await page.getByLabel("I am 18 or older.").check();
    await page.getByRole("button", { name: "Continue" }).click();
  }

  const name = `Juniper${Date.now() % 100000}`.replace(/\d/g, (d) => "abcdefghij"[Number(d)]);
  await page.goto("/children/new");
  await page.locator("input[name=firstName]").fill(name);
  await page.locator("input[name=age]").fill("6");
  await page.locator("input[value=she]").check();
  await page.getByText("More about them").click();
  await page.locator("input[name=colors]").fill("teal");
  await page.locator("input[name=animals]").fill("sea turtles");
  await page.locator("input[name=activities]").fill("swimming");
  await page.getByRole("button", { name: "Next: add photos" }).click();
  await expect(page.getByRole("heading", { level: 1, name: new RegExp(`Photos of`) })).toBeVisible();
  await page.getByRole("link", { name: /^← / }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();

  await page.getByRole("link", { name: "New book" }).click();
  // One house theme: pick one of the six stories (the first is chosen already).
  await expect(page.getByTestId("simple-book-form").locator('[data-testid^="story-"]')).toHaveCount(6);
  await page.getByTestId("story-teacup-pond").click();
  await page.getByTestId("create-book").click();

  await expect(page).toHaveURL(/\/books\/\w+$/);
  await expect(page.getByTestId("book-title")).toContainText(name, { timeout: 60_000 });
  await expect(page.getByTestId("progress")).toBeHidden({ timeout: 90_000 });

  // 1 cover + 1 inside cover + 24 interior pages (16 story + front/back matter + padding) + 1 inside cover + 1 back.
  await expect(page.getByTestId("page-indicator")).toHaveText(/^1 \/ 28$/);
  // Desktop shows two pages at a time, phones one; page forward until page 1 is in view.
  const belongsTo = page.getByTestId("flipbook").getByText("This book belongs to");
  for (let i = 0; i < 3 && !(await belongsTo.isVisible()); i++) {
    await page.getByRole("button", { name: "Next page" }).click();
    await page.waitForTimeout(900);
  }
  await expect(belongsTo).toBeVisible();
  await expect(page.getByTestId("page-indicator")).not.toHaveText(/^1 \//);
});

test("protected characters get a friendly message, not a book", async ({ page }) => {
  await page.goto("/children/new");
  if (page.url().includes("/welcome")) {
    await page.getByLabel("I am 18 or older.").check();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.goto("/children/new");
  }
  await page.locator("input[name=firstName]").fill("Rowan");
  await page.locator("input[name=age]").fill("4");
  await page.locator("input[value=he]").check();
  await page.getByText("More about them").click();
  await page.locator("input[name=activities]").fill("watching Paw Patrol");
  await page.getByRole("button", { name: "Next: add photos" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Paw Patrol" })).toContainText("trademarked");
  // What the parent typed is kept so they can fix it.
  await expect(page.locator("input[name=firstName]")).toHaveValue("Rowan");
});
