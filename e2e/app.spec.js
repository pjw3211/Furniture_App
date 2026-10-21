import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.errors = errors;
  await page.goto("/");
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
});

test.afterEach(async ({ page }) => {
  expect(page.errors).toEqual([]);
});

test("opens with all six furniture types", async ({ page }) => {
  for (const id of ["coffee_table", "side_table", "sofa", "lounge_chair", "credenza", "bookcase"])
    await expect(page.locator(`[data-type="${id}"]`)).toBeVisible();
  await expect(page.locator("#err")).toBeHidden();
});

test("every type can be opened in the designer", async ({ page }) => {
  for (const id of ["coffee_table", "side_table", "sofa", "lounge_chair", "credenza", "bookcase"]) {
    await page.locator(`[data-type="${id}"]`).click();
    await expect.poll(() => page.evaluate(() => window.__app.cur().type)).toBe(id);
  }
});

test("a piece can be saved, placed in the room and exported", async ({ page }) => {
  await page.locator('[data-type="credenza"]').click();
  const before = await page.evaluate(() => window.__app.items().length);
  await page.locator("#place").click();
  await expect.poll(() => page.evaluate(() => window.__app.items().length)).toBeGreaterThan(before);

  await page.locator("#tab-design").click();
  const download = page.waitForEvent("download");
  await page.locator("#dl-stl").click();
  expect((await download).suggestedFilename()).toMatch(/\.stl$/);
});

test("room tab shows room options", async ({ page }) => {
  await page.locator("#tab-room").click();
  await expect(page.locator("#pane-room")).toBeVisible();
  await expect(page.locator("#arrange")).toBeVisible();
  await page.locator("#arrange").click();
});
