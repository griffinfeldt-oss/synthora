import { expect, test } from "@playwright/test";
import { totpCode } from "../src/lib/totp";
import { alertText, db, signIn, uniqueEmail } from "./support";

test.afterAll(async () => {
  await db.$disconnect();
});

/** Tokens are stored hashed; read the raw one from the email the app "sent". */
async function linkFromOutbox(email: string, path: string): Promise<string> {
  const mail = await db.emailOutbox.findFirstOrThrow({ where: { to: email }, orderBy: { createdAt: "desc" } });
  const m = mail.text.match(new RegExp(`(${path}\\?token=[A-Za-z0-9_-]+)`));
  if (!m) throw new Error("No link in email");
  return m[1];
}

test("sign up, confirm the email, sign out and back in, and survive a wrong password", async ({ page }) => {
  const email = uniqueEmail("newbuyer");
  await page.goto("/sign-up");
  const form = page.locator("main");
  await form.getByLabel("Name").fill("New Buyer");
  await form.getByLabel("Email").fill(email);
  await form.getByLabel("Password").fill("correct-horse-battery");
  await form.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/account/);
  await expect(page.getByText("Confirm your email")).toBeVisible();

  await page.goto(await linkFromOutbox(email, "/verify-email"));
  await page.getByRole("button", { name: "Confirm my email" }).click();
  await expect(page.getByText("Email confirmed")).toBeVisible();

  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL("/");
    if (i === 0) {
      await signIn(page, email, "wrong-password-123", "/account", false);
      await expect(alertText(page)).toHaveText("That email and password don't match.");
    }
    await signIn(page, email, "correct-horse-battery");
    await expect(page).toHaveURL(/\/account/);
  }
});

test("a password reset signs out other sessions", async ({ browser }) => {
  const email = uniqueEmail("resetter");
  const a = await browser.newPage();
  await a.goto("/sign-up");
  await a.locator("main").getByLabel("Name").fill("Reset Tester");
  await a.locator("main").getByLabel("Email").fill(email);
  await a.locator("main").getByLabel("Password").fill("first-password-123");
  await a.locator("main").getByRole("button", { name: "Create account" }).click();
  await a.waitForURL(/\/account/);

  const b = await browser.newPage();
  await b.goto("/forgot-password");
  await b.locator("main").getByLabel("Email").fill(email);
  await b.locator("main").getByRole("button", { name: "Email me a reset link" }).click();
  await expect(b.locator("main [role=status]")).toContainText("reset link is on its way");
  await b.goto(await linkFromOutbox(email, "/reset-password"));
  await b.getByLabel("New password").fill("second-password-456");
  await b.getByLabel("Type it again").fill("second-password-456");
  await b.getByRole("button", { name: "Save new password" }).click();
  await b.waitForURL(/\/sign-in\?reset=1/);

  // The first browser's session no longer works.
  await a.goto("/account");
  await expect(a).toHaveURL(/\/sign-in/);
});

test("admin pages need a second factor, then show the action queue", async ({ page }) => {
  await db.user.update({ where: { email: "admin@synthora.market" }, data: { twoFactorSecret: null, twoFactorEnabledAt: null } });
  await signIn(page, "admin@synthora.market", undefined, "/admin");
  await expect(page).toHaveURL(/\/two-factor/);
  const key = (await page.locator("code").first().innerText()).replace(/\s+/g, "");
  await page.getByLabel("6-digit code").fill("000000");
  await page.getByRole("button", { name: "Confirm and continue" }).click();
  await expect(alertText(page)).toContainText("didn't match");
  await page.getByLabel("6-digit code").fill(totpCode(key));
  await page.getByRole("button", { name: "Confirm and continue" }).click();
  await page.waitForURL(/\/admin$/);
  await page.getByRole("link", { name: "Action queue" }).click();
  await expect(page.getByText("Partner orders that failed (1)")).toBeVisible();
});
