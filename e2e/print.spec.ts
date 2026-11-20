import { expect, test } from "@playwright/test";

test("make print files, read the preflight, download PDFs, run the printer check", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "one run is enough for this flow");
  test.setTimeout(240_000);
  await page.goto("/");
  if (page.url().includes("/welcome")) {
    await page.getByLabel("I am 18 or older.").check();
    await page.getByRole("button", { name: "Continue" }).click();
  }
  await page.goto("/children/new");
  const name = `Pia${"abcdefghij"[Date.now() % 10]}`;
  await page.locator("input[name=firstName]").fill(name);
  await page.locator("input[name=age]").fill("4");
  await page.locator("input[value=she]").check();
  await page.getByRole("button", { name: "Save child" }).click();
  await page.getByRole("link", { name: "New book" }).click();
  await page.getByTestId("theme-dinosaur-valley").click();
  await page.locator("select[name=length]").selectOption("12");
  await page.getByTestId("create-book").click();
  await page.getByTestId("print-files").click({ timeout: 60_000 });

  await page.getByTestId("make-print-files").click();
  const exportCard = page.getByTestId("export").first();
  await expect(exportCard.getByTestId("preflight-summary")).toContainText("ready to print", { timeout: 150_000 });
  await expect(exportCard.getByTestId("preflight")).toContainText("8.75 x 8.75 in");

  const href = await exportCard.getByTestId("download-interior").getAttribute("href");
  const res = await page.request.get(href!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/pdf");
  expect((await res.body()).subarray(0, 5).toString()).toBe("%PDF-");

  await exportCard.getByTestId("validate").click();
  await expect(page.getByTestId("validation-passed").first()).toBeVisible({ timeout: 60_000 });
});
