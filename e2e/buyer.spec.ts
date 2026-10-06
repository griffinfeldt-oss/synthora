import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { db, digitalListingUrl, uniqueEmail } from "./support";

test.afterAll(async () => {
  await db.$disconnect();
});

test("a guest buys a digital file: honest page, one order on double submit, download after paying", async ({ page }) => {
  const url = await digitalListingUrl(page);
  await page.goto(url);
  await expect(page.getByText("Digital download. Nothing is shipped.")).toBeVisible();
  await expect(page.getByText(/^Licence:/)).toBeVisible();
  await expect(page.getByText("PREVIEW", { exact: false }).first()).toBeVisible();

  // Keyboard only: reach "Add to cart" and press Enter.
  const add = page.getByRole("button", { name: "Add to cart" });
  await add.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: /Added/ })).toBeVisible();

  const email = uniqueEmail("guest");
  await page.goto("/checkout");
  await page.getByLabel("Email for your receipt and tracking").fill(email);
  const pay = page.getByRole("button", { name: "Pay with Stripe" });
  await expect(pay).toBeEnabled();
  // Double click: the second submit must reuse the same order.
  await pay.dblclick();
  await page.waitForURL(/\/mock\/stripe\/checkout\//);
  expect(await db.order.count({ where: { email } })).toBe(1);

  // Back to the shop and forward again: still one pending order, nothing paid.
  await page.goBack();
  await page.goForward();
  await page.getByRole("button", { name: /^Pay \$/ }).click();
  await page.waitForURL(/\/checkout\/success/);
  await expect(page.getByText("Your files are ready on your order page.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Thank you" })).toBeVisible();

  await page.getByRole("link", { name: "Track your order" }).click();
  const download = page.getByRole("link", { name: /^Download / });
  await expect(download).toBeVisible();
  await expect(page.getByText(/of 20 downloads used/)).toBeVisible();
  const order = await db.order.findFirstOrThrow({ where: { email }, include: { items: { include: { entitlement: true } } } });
  expect(order.status).not.toBe("PENDING_PAYMENT");
  expect(order.items[0].entitlement?.status).toBe("ACTIVE");
  const res = await page.request.get((await download.getAttribute("href"))!, { maxRedirects: 0 });
  expect(res.status()).toBe(302);
});

test("listing and checkout pages have no serious accessibility violations", async ({ page }) => {
  for (const path of [await digitalListingUrl(page), "/shop", "/checkout", "/sign-up"]) {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${path}: ${v.id} (${v.nodes.length})`)).toEqual([]);
  }
});
