/**
 * SYN-001: proving mailbox ownership before linking orders or granting authority.
 */
import { beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";

const { db } = await import("@/lib/db");
const { hit } = await import("@/lib/rate-limit");
const { base32Decode, base32Encode, newTotpSecret, totpCode, verifyTotp } = await import("@/lib/totp");
const { linkGuestOrders, requestPasswordReset, resetPassword, sendVerificationEmail, verifyEmail, checkAdminCode, sealTotpSecret } = await import("@/server/identity");
const { isAdmin } = await import("@/server/session");
const { resetDb } = await import("./support/db");

async function guestOrder(email: string) {
  return db.order.create({
    data: { number: `T-${Math.random().toString(36).slice(2, 8)}`, email, subtotalCents: 1000, shippingCents: 0, totalCents: 1000, accessToken: Math.random().toString(36), feePolicyVersion: "test", status: "PAID", paidAt: new Date() },
  });
}

/** The raw token from the most recent email to this address. */
async function tokenFromEmail(to: string, path: string): Promise<string> {
  const mail = await db.emailOutbox.findFirstOrThrow({ where: { to }, orderBy: { createdAt: "desc" } });
  const m = mail.text.match(new RegExp(`${path}\\?token=([A-Za-z0-9_-]+)`));
  if (!m) throw new Error(`No ${path} link in: ${mail.text}`);
  return m[1];
}

beforeEach(async () => {
  await resetDb();
});

describe("guest orders and verification", () => {
  it("an unverified account claiming someone's email sees none of their guest orders", async () => {
    await guestOrder("victim@test.local");
    const attacker = await db.user.create({ data: { email: "victim@test.local", passwordHash: await bcrypt.hash("x".repeat(12), 4) } });
    expect(await linkGuestOrders(attacker.id)).toBe(0);
    expect(await db.order.count({ where: { buyerId: attacker.id } })).toBe(0);
  });

  it("the emailed link verifies the address and only then links guest orders", async () => {
    await guestOrder("maya@test.local");
    await guestOrder("maya@test.local");
    const user = await db.user.create({ data: { email: "maya@test.local" } });
    expect(await sendVerificationEmail(user.id)).toBe("sent");
    const token = await tokenFromEmail("maya@test.local", "/verify-email");
    const res = await verifyEmail(token);
    expect(res).toEqual({ ok: true, linkedOrders: 2 });
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerified).not.toBeNull();
    // Single use.
    expect((await verifyEmail(token)).ok).toBe(false);
  });

  it("rejects tokens that are wrong, expired, or for an address the account no longer has", async () => {
    const user = await db.user.create({ data: { email: "a@test.local" } });
    await sendVerificationEmail(user.id);
    const token = await tokenFromEmail("a@test.local", "/verify-email");
    expect((await verifyEmail("not-a-real-token-at-all-xxxxx")).ok).toBe(false);
    await db.user.update({ where: { id: user.id }, data: { email: "b@test.local" } });
    expect((await verifyEmail(token)).ok).toBe(false);

    await sendVerificationEmail(user.id);
    const t2 = await tokenFromEmail("b@test.local", "/verify-email");
    await db.authToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await verifyEmail(t2)).ok).toBe(false);
  });

  it("a new link replaces the old one", async () => {
    const user = await db.user.create({ data: { email: "c@test.local" } });
    await sendVerificationEmail(user.id);
    const first = await tokenFromEmail("c@test.local", "/verify-email");
    await sendVerificationEmail(user.id);
    expect((await verifyEmail(first)).ok).toBe(false);
  });
});

describe("password reset", () => {
  it("resets once, proves the mailbox, and signs out every existing session", async () => {
    const user = await db.user.create({ data: { email: "r@test.local", passwordHash: await bcrypt.hash("old-password-123", 4) } });
    await requestPasswordReset("R@test.local ");
    const token = await tokenFromEmail("r@test.local", "/reset-password");
    expect(await resetPassword(token, "new-password-456")).toBe(true);
    const after = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await bcrypt.compare("new-password-456", after.passwordHash!)).toBe(true);
    expect(after.sessionVersion).toBe(1);
    expect(after.emailVerified).not.toBeNull();
    expect(await resetPassword(token, "another-password-789")).toBe(false);
  });

  it("does nothing visible for an unknown email", async () => {
    await requestPasswordReset("nobody@test.local");
    expect(await db.emailOutbox.count()).toBe(0);
  });
});

describe("admin authority", () => {
  it("comes only from a stored role on a verified account, never from ADMIN_EMAILS", async () => {
    // ADMIN_EMAILS=admin@test.local in the test environment.
    const listed = await db.user.create({ data: { email: "admin@test.local", emailVerified: new Date() } });
    expect(isAdmin(listed)).toBe(false);
    const unverified = await db.user.create({ data: { email: "u@test.local", role: "ADMIN" } });
    expect(isAdmin(unverified)).toBe(false);
    const real = await db.user.create({ data: { email: "v@test.local", role: "ADMIN", emailVerified: new Date() } });
    expect(isAdmin(real)).toBe(true);
  });

  it("second factor: right code passes, wrong code fails, and guessing is rate limited", async () => {
    const secret = newTotpSecret();
    const admin = await db.user.create({ data: { email: "a2@test.local", role: "ADMIN", emailVerified: new Date(), twoFactorSecret: sealTotpSecret(secret), twoFactorEnabledAt: new Date() } });
    expect(await checkAdminCode(admin, totpCode(secret))).toBe(true);
    expect(await checkAdminCode(admin, "000000")).toBe(false);
    for (let i = 0; i < 10; i++) await checkAdminCode(admin, "111111");
    // Even the right code is refused once the limit is hit.
    expect(await checkAdminCode(admin, totpCode(secret))).toBe(false);
    expect(await db.auditLog.count({ where: { action: "security.mfa_failed" } })).toBeGreaterThan(0);
  });
});

describe("primitives", () => {
  it("TOTP matches RFC 6238 test vectors (SHA-1)", () => {
    // RFC 6238 Appendix B secret "12345678901234567890", 8-digit codes truncated to 6.
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    expect(base32Decode(secret).toString()).toBe("12345678901234567890");
    expect(totpCode(secret, 59_000)).toBe("287082");
    expect(totpCode(secret, 1111111109_000)).toBe("081804");
    expect(verifyTotp(secret, "287082", 59_000 + 30_000)).toBe(true); // one step of drift
    expect(verifyTotp(secret, "287082", 59_000 + 120_000)).toBe(false);
  });

  it("rate limits count per window and refuse past the limit", async () => {
    const results: boolean[] = [];
    for (let i = 0; i < 7; i++) results.push(await hit("signUp", "203.0.113.9"));
    expect(results.slice(0, 5).every(Boolean)).toBe(true);
    expect(results[5]).toBe(false);
    // Other subjects are unaffected.
    expect(await hit("signUp", "198.51.100.1")).toBe(true);
  });
});
