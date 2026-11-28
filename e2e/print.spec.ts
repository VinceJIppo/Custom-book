import { expect, test } from "@playwright/test";

test("make print files, check them, then order a printed copy and follow its status", async ({ page }, info) => {
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
  await page.getByRole("button", { name: "Next: add photos" }).click();
  await expect(page.getByRole("heading", { level: 1, name: new RegExp(`Photos of`) })).toBeVisible();
  await page.getByRole("link", { name: /^← / }).click();
  await page.getByRole("link", { name: "New book" }).click();
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

  // Phase 4: order it (mock printer, offline test checkout).
  await page.getByTestId("order-from-print").first().click();
  await page.locator("input[name=name]").fill("Grandma Rose");
  await page.locator("input[name=street1]").fill("12 Elm Street");
  await page.locator("input[name=city]").fill("Springfield");
  await page.locator("input[name=stateCode]").fill("IL");
  await page.locator("input[name=postcode]").fill("6270");
  await page.locator("input[name=phone]").fill("217-555-0100");
  await page.getByTestId("get-prices").click();
  await expect(page.getByText("Use a 5-digit ZIP code")).toBeVisible();
  await page.locator("input[name=postcode]").fill("62704");
  await page.getByTestId("get-prices").click();
  const options = page.getByTestId("shipping-options");
  await expect(options).toContainText("Standard mail");
  await expect(options).toContainText("Express (overnight)");
  await options.getByText("Ground", { exact: true }).click();
  await page.locator("textarea[name=giftNote]").fill("Happy birthday from Grandma!");
  // Pay by card in this test (the local account may have credits, which would pay it all).
  const useCredits = page.locator("input[name=useCredits]");
  if ((await useCredits.count()) && (await useCredits.isChecked())) await useCredits.uncheck();
  await page.getByTestId("checkout").click();
  await page.getByTestId("mock-pay").click();
  await expect(page.getByTestId("order-status")).toContainText("With the printer", { timeout: 30_000 });
  await expect(page.getByText("Happy birthday from Grandma!")).toBeVisible();
  await expect(page.getByTestId("order-history")).toContainText("Payment received");
  await page.getByTestId("check-status").click();
  await expect(page.getByTestId("order-status")).toBeVisible();

  await page.goto("/orders");
  await expect(page.getByTestId("order-list")).toContainText("Grandma Rose");
  await page.goto("/admin/orders");
  await expect(page.getByTestId("admin-orders")).toContainText("Grandma Rose");
});
