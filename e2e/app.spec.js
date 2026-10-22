import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.errors = errors;
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
});

test.afterEach(async ({ page }) => {
  expect(page.errors).toEqual([]);
});

const built = page => page.evaluate(() => window.__built || 0);
async function waitForBuild(page, after) {
  await expect.poll(() => built(page), { timeout: 90000 }).toBeGreaterThan(after);
  await expect(page.locator("#dl-pdf")).toBeEnabled();
}

test("choose the coffee table, pick from the dropdowns, download the DXF and cut list", async ({ page }) => {
  await expect(page.locator("#home")).toBeVisible();
  await page.locator('[data-piece="coffee_table"]').click();
  await expect(page.locator("#design")).toBeVisible();
  for (const title of ["Size", "Features", "Profiles", "Joinery"])
    await expect(page.locator("section h3", { hasText: title })).toBeVisible();
  await waitForBuild(page, 0);
  await expect(page.locator("#parts")).toContainText("Leg");

  // A slatted shelf, pegs and loose tenons: the parts list follows.
  let n = await built(page);
  await page.selectOption("#f-shelf", "slats");
  await waitForBuild(page, n);
  await expect(page.locator("#parts")).toContainText("Shelf slat");
  n = await built(page);
  await page.selectOption("#f-joint", "domino");
  await waitForBuild(page, n);
  n = await built(page);
  await page.selectOption("#f-pegs", "pegged");
  await waitForBuild(page, n);
  await expect(page.locator("#buy")).toContainText("Domino");
  await expect(page.locator("#buy")).toContainText("Dowel peg");

  // Pegs rule out joints without a tenon.
  await expect(page.locator('#f-joint option[value="dowels"]')).toBeDisabled();

  const dxf = page.waitForEvent("download", { timeout: 60000 });
  await page.locator("#dl-dxf").click();
  const d = await dxf;
  expect(d.suggestedFilename()).toMatch(/\.dxf$/);
  const text = readFileSync(await d.path(), "utf8");
  expect(text).toContain("Shelf slat");
  expect(text).toContain("ENTITIES");

  const pdf = page.waitForEvent("download", { timeout: 60000 });
  await page.locator("#dl-pdf").click();
  const p = await pdf;
  expect(p.suggestedFilename()).toMatch(/\.pdf$/);
  expect(readFileSync(await p.path()).subarray(0, 5).toString()).toBe("%PDF-");
});

test("custom size in millimetres", async ({ page }) => {
  await page.locator('[data-piece="coffee_table"]').click();
  await waitForBuild(page, 0);
  await page.locator('[data-units="mm"]').click();
  const n = await built(page);
  await page.selectOption("#f-size", "custom");
  await page.fill("#d-l", "1100");
  await page.locator("#d-l").dispatchEvent("change");
  await expect.poll(() => page.evaluate(() => window.__app.state().choice.l)).toBeCloseTo(1100 / 25.4, 0);
  await waitForBuild(page, n);
  await expect(page.locator("#parts")).toContainText("1100 ×");
});

test("pull apart shows the joints", async ({ page }) => {
  await page.locator('[data-piece="coffee_table"]').click();
  await waitForBuild(page, 0);
  await page.locator("#explode").click();
  await expect(page.locator("#explode")).toHaveText("Put together");
});
