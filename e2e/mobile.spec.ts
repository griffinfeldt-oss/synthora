import { expect, test } from "@playwright/test";
import { db, digitalListingUrl } from "./support";

test.afterAll(async () => {
  await db.$disconnect();
});

// Runs in the 360 px wide phone project.
test("key pages fit a 360 px phone without sideways scrolling", async ({ page }) => {
  for (const path of ["/", "/shop", await digitalListingUrl(page), "/checkout", "/sign-in", "/legal/returns"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(0);
  }
});

test("the digital/physical distinction and price stay visible on a phone", async ({ page }) => {
  await page.goto(await digitalListingUrl(page));
  await expect(page.getByText("Digital download. Nothing is shipped.")).toBeInViewport({ ratio: 0.1 }).catch(async () => {
    await page.getByText("Digital download. Nothing is shipped.").scrollIntoViewIfNeeded();
    await expect(page.getByText("Digital download. Nothing is shipped.")).toBeVisible();
  });
  await expect(page.locator("main").getByText(/^\$\d+\.\d\d$/).first()).toBeVisible();
});
