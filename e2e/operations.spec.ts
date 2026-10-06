import { expect, test } from "@playwright/test";
import { db, signIn } from "./support";

test.afterAll(async () => {
  await db.$disconnect();
});

test("a failed partner order is visible to the seller with a clear next step", async ({ page }) => {
  await signIn(page, "nightshift@example.com", undefined, "/seller/orders");
  await expect(page.locator("main").getByText("Action needed").first()).toBeVisible();
});

test("a buyer sees a pending payment as pending, never as paid", async ({ page }) => {
  const pending = await db.order.findFirstOrThrow({ where: { status: "PENDING_PAYMENT" } });
  await page.goto(`/orders/${pending.id}?t=${pending.accessToken}`);
  await expect(page.getByText("Waiting for payment confirmation")).toBeVisible();
  await expect(page.getByRole("link", { name: /^Download / })).toHaveCount(0);
});
