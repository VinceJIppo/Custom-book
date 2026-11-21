import { expect, test } from "@playwright/test";

test("a grown-up co-stars: Mama is secretly a superhero, in the gentle ink & wash look", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "one run is enough for this flow");
  test.setTimeout(180_000);
  await page.goto("/");
  if (page.url().includes("/welcome")) {
    await page.getByLabel("I am 18 or older.").check();
    await page.getByRole("button", { name: "Continue" }).click();
  }
  const suffix = `${Date.now() % 100000}`.replace(/\d/g, (d) => "abcdefghij"[Number(d)]);
  const childName = `Oli${suffix}`;
  const momName = `Mama${suffix}`;

  // A grown-up with a description instead of a photo character.
  await page.goto("/people/new");
  await page.locator("input[name=firstName]").fill("Bina");
  await page.locator("input[name=nickname]").fill(momName);
  await page.locator("input[name=relationship]").fill("Mom");
  await page.locator("textarea[name=about]").fill("A nurse who loves gardening");
  await page.locator("input[name=look]").fill("long curly black hair and round glasses");
  await page.getByTestId("save-grownup").click();
  await expect(page.getByRole("heading", { level: 1, name: momName })).toBeVisible();

  await page.goto("/children/new");
  await page.locator("input[name=firstName]").fill(childName);
  await page.locator("input[name=age]").fill("4");
  await page.locator("input[value=he]").check();
  await page.getByRole("button", { name: "Save child" }).click();
  await page.getByRole("link", { name: "New book" }).click();

  await page.getByTestId("theme-quiet-meadow").click();
  await page.getByTestId(`cast-${momName}`).check();
  await page.locator("textarea[name^=part_]").fill(`${momName} is secretly a superhero, and ${childName} doesn't know it.`);
  await page.getByLabel(momName, { exact: true }).check();
  await page.locator("select[name=length]").selectOption("12");
  await page.getByTestId("voice-quiet-wisdom").click();
  await expect(page.locator("select[name=style]")).toHaveValue("gentle-ink-wash");
  await page.getByTestId("create-book").click();

  await expect(page).toHaveURL(/\/books\/\w+$/);
  await expect(page.getByTestId("progress")).toBeHidden({ timeout: 90_000 });
  const book = page.getByTestId("flipbook");
  await expect(book.getByText(`starring ${childName} and ${momName}`).first()).toBeVisible();
  await expect(page.locator('.bk-page[data-look="vignette"]').first()).toBeAttached();

  // Mama's page lists the book she's in.
  await page.goto("/");
  await page.getByTestId("grownups").getByRole("link", { name: new RegExp(momName) }).click();
  await expect(page.getByRole("link", { name: /Quiet Meadow|and/ }).first()).toBeVisible();
});
