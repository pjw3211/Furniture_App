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

test("coffee table parts can be downloaded as STL, DXF, cut list and zip", async ({ page }) => {
  await page.locator('[data-type="coffee_table"]').click();
  await expect(page.locator("#parts-list .prow")).toHaveCount(4, { timeout: 90000 });
  await expect(page.locator("#parts-list")).toContainText("Leg × 4");
  for (const [sel, ext] of [['#parts-list .prow >> nth=1 >> [data-k="dxf"]', ".dxf"],
    ['#parts-list .prow >> nth=3 >> [data-k="stl"]', ".stl"], ["#dl-csv", ".csv"], ["#dl-zip", ".zip"]]) {
    const download = page.waitForEvent("download", { timeout: 60000 });
    await page.locator(sel).click();
    expect((await download).suggestedFilename()).toMatch(new RegExp(ext.replace(".", "\\.") + "$"));
  }
  await page.locator("#exact-view").click();
  await expect(page.locator("#exact-view")).toHaveText("Show quick model");
});

test("pieces without exact parts yet say so", async ({ page }) => {
  await page.locator('[data-type="sofa"]').click();
  await expect(page.locator("#exact-sub")).toContainText("coming in a later update");
  await expect(page.locator("#exact-actions")).toBeHidden();
});
