import { PrismaClient } from "@prisma/client";
import type { Page } from "@playwright/test";

/** The isolated e2e database (see scripts/e2e-server.sh). */
export const db = new PrismaClient({ datasourceUrl: process.env.E2E_DATABASE_URL ?? "postgresql://synthora:synthora@localhost:5432/synthora_e2e" });

export const DEMO_PASSWORD = "synthora-demo";

/** Fill the sign-in form. With `expectSuccess`, waits until the app has redirected. */
export async function signIn(page: Page, email: string, password = DEMO_PASSWORD, next = "/account", expectSuccess = true) {
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  const main = page.locator("main");
  await main.getByLabel("Email", { exact: true }).fill(email);
  await main.getByLabel("Password").fill(password);
  await main.getByRole("button", { name: "Sign in" }).click();
  if (expectSuccess) await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"));
}

/** The page's own alert, not Next's route announcer. */
export const alertText = (page: Page) => page.locator("main [role=alert]");

export function uniqueEmail(tag: string) {
  return `${tag}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}@example.com`;
}

/** Find a public digital listing's URL from the shop. */
export async function digitalListingUrl(page: Page): Promise<string> {
  await page.goto("/shop?fulfillment=digital");
  const href = await page.locator('a[href^="/l/"]').first().getAttribute("href");
  if (!href) throw new Error("No digital listing in the shop");
  return href;
}
