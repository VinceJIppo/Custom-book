import { expect, test } from "@playwright/test";
import sharp from "sharp";

test.describe.configure({ mode: "serial" });

async function onboard(page: import("@playwright/test").Page) {
  await page.goto("/");
  if (page.url().includes("/welcome")) {
    await page.getByLabel("I am 18 or older.").check();
    await page.getByRole("button", { name: "Continue" }).click();
  }
}

test("photo -> character options -> approve -> book -> edit one page", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "one run is enough for this flow");
  await onboard(page);
  const name = `Wren${"abcdefghij"[Date.now() % 10]}${"abcdefghij"[Math.floor(Date.now() / 10) % 10]}`;
  await page.goto("/children/new");
  await page.locator("input[name=firstName]").fill(name);
  await page.locator("input[name=age]").fill("5");
  await page.locator("input[value=she]").check();
  // Saving goes straight on to the photos.
  await page.getByRole("button", { name: "Next: add photos" }).click();
  await expect(page.getByRole("heading", { level: 1, name: `Photos of ${name}` })).toBeVisible();
  const photo = await sharp({ create: { width: 800, height: 1000, channels: 3, background: "#d8b894" } }).jpeg().toBuffer();
  await page.locator("input[name=photos]").setInputFiles({ name: "kid.jpg", mimeType: "image/jpeg", buffer: photo });
  await page.locator("input[name=consent]").check();
  await page.getByRole("button", { name: /Upload/ }).click();
  await expect(page.getByText("kid.jpg: added.")).toBeVisible();

  // Drawing starts on its own once there's a photo (no style to pick).
  await expect(page.getByTestId("drawing-started")).toBeVisible();
  await page.reload();
  await page.getByTestId("approve-0").click({ timeout: 30_000 });
  await page.getByText("Fix a detail").click({ timeout: 30_000 });
  await expect(page.getByTestId("bible-form")).toBeVisible();
  await expect(page.locator('img[alt="Uploaded photo"]')).toHaveCount(0); // originals deleted by default

  await page.getByRole("link", { name: new RegExp(`Make a book with ${name}`) }).click();
  await page.getByTestId("story-sunflower-clock").click();
  await page.getByTestId("create-book").click();
  await expect(page.getByTestId("edit-pages")).toBeVisible({ timeout: 60_000 });

  await page.getByTestId("edit-pages").click();
  await page.getByTestId("edit-page-card").first().getByRole("link", { name: /Page 1/ }).click();
  await page.getByTestId("page-text").fill("A brand-new first line.");
  await page.getByRole("button", { name: "Save text" }).click();
  await expect(page.getByText("Text saved.")).toBeVisible();
  await page.getByTestId("art-note").fill("add a friendly owl");
  await page.getByTestId("art-edit").click();
  await expect(page.getByTestId("history").locator("li")).toHaveCount(2, { timeout: 30_000 });

  // Delete the character (after the confirm prompt); its pictures are erased.
  await page.goto("/");
  await page.getByRole("link", { name, exact: true }).first().click();
  await page.getByRole("link", { name: "Photos & character" }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByTestId("approved-sheet").getByTestId("delete-character").click();
  await expect(page.getByText("Character deleted.")).toBeVisible();
  await expect(page.getByTestId("approved-sheet")).toHaveCount(0);
});

test("custom theme: protected names are refused, a description becomes an editable theme", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "one run is enough for this flow");
  await onboard(page);
  await page.goto("/themes/new");
  await page.getByTestId("theme-description").fill("Everything Spider-Man");
  await page.getByTestId("draft-theme").click();
  await expect(page.getByRole("alert").filter({ hasText: "trademarked" })).toBeVisible();
  await page.getByTestId("theme-description").fill("She loves trains, tunnels and the color red");
  await page.getByTestId("draft-theme").click();
  await expect(page.getByTestId("theme-editor")).toBeVisible();
  await page.locator("input[name=name]").fill("Red Rail Railway");
  await page.getByTestId("save-theme").click();
  await expect(page.getByRole("status").filter({ hasText: "Theme saved" })).toBeVisible();
});
