/**
 * Proof of mailbox ownership, password reset, and admin two-factor.
 *
 * Nothing here trusts an email string on its own: guest orders are attached and
 * privileges are honoured only for an address the person has proven they control.
 */
import "server-only";
import { createHmac } from "node:crypto";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import type { AuthTokenKind, User } from "@prisma/client";
import { BRAND } from "@/config/brand";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { decryptJson, encryptJson, randomToken, safeEqual, sha256 } from "@/lib/crypto";
import { sendEmail } from "@/lib/email";
import { hit } from "@/lib/rate-limit";
import { newTotpSecret, verifyTotp } from "@/lib/totp";
import { audit } from "./notify";

const HOUR = 3_600_000;

async function issueToken(user: Pick<User, "id" | "email">, kind: AuthTokenKind, ttlMs: number): Promise<string> {
  const raw = randomToken(32);
  // Older unused tokens of the same kind stop working.
  await db.authToken.updateMany({ where: { userId: user.id, kind, usedAt: null }, data: { usedAt: new Date() } });
  await db.authToken.create({
    data: { userId: user.id, kind, email: user.email, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + ttlMs) },
  });
  return raw;
}

/** Consume a token once. Returns its user if valid, unexpired, unused and for the user's current email. */
async function consumeToken(raw: string, kind: AuthTokenKind) {
  if (!raw || raw.length < 20) return null;
  const token = await db.authToken.findUnique({ where: { tokenHash: sha256(raw) }, include: { user: true } });
  if (!token || token.kind !== kind || token.usedAt || token.expiresAt < new Date()) return null;
  if (token.email !== token.user.email) return null;
  const claimed = await db.authToken.updateMany({ where: { id: token.id, usedAt: null }, data: { usedAt: new Date() } });
  return claimed.count === 1 ? token.user : null;
}

// ─── Email verification ──────────────────────────────────────────────────────

export async function sendVerificationEmail(userId: string): Promise<"sent" | "limited" | "already"> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return "limited";
  if (user.emailVerified) return "already";
  if (!(await hit("emailSend", user.id))) return "limited";
  const token = await issueToken(user, "VERIFY_EMAIL", 24 * HOUR);
  await sendEmail({
    to: user.email,
    subject: `Confirm your email for ${BRAND.name}`,
    text: `Confirm this is your email address by opening the link below. It works for 24 hours.\n\n${env.appUrl}/verify-email?token=${token}\n\nIf you did not create a ${BRAND.name} account, ignore this email.`,
  });
  return "sent";
}

export async function verifyEmail(raw: string): Promise<{ ok: boolean; linkedOrders: number }> {
  const user = await consumeToken(raw, "VERIFY_EMAIL");
  if (!user) return { ok: false, linkedOrders: 0 };
  await db.user.update({ where: { id: user.id }, data: { emailVerified: user.emailVerified ?? new Date() } });
  const linkedOrders = await linkGuestOrders(user.id);
  await audit(user.id, "security.email_verified", "User", user.id, { linkedOrders });
  return { ok: true, linkedOrders };
}

/** Attach guest checkouts placed with this email, but only once the mailbox is proven. */
export async function linkGuestOrders(userId: string): Promise<number> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user?.emailVerified) return 0;
  const res = await db.order.updateMany({ where: { email: user.email, buyerId: null }, data: { buyerId: user.id } });
  return res.count;
}

// ─── Password reset ──────────────────────────────────────────────────────────

/** Always behaves the same whether or not the account exists. */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await db.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user || !(await hit("passwordReset", user.id))) return;
  const token = await issueToken(user, "RESET_PASSWORD", HOUR);
  await sendEmail({
    to: user.email,
    subject: `Reset your ${BRAND.name} password`,
    text: `Someone asked to reset the password for this account. If it was you, open this link within an hour:\n\n${env.appUrl}/reset-password?token=${token}\n\nIf it was not you, ignore this email. Your password has not changed.`,
  });
  await audit(user.id, "security.password_reset_requested", "User", user.id);
}

export async function resetPassword(raw: string, password: string): Promise<boolean> {
  const user = await consumeToken(raw, "RESET_PASSWORD");
  if (!user) return false;
  await db.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(password, 12),
      // The link proved control of the mailbox.
      emailVerified: user.emailVerified ?? new Date(),
      // Every existing session for this account stops working.
      sessionVersion: { increment: 1 },
    },
  });
  await linkGuestOrders(user.id);
  await audit(user.id, "security.password_reset", "User", user.id);
  return true;
}

// ─── Admin two-factor ────────────────────────────────────────────────────────

export const MFA_COOKIE = "syn_admin_mfa";
const MFA_TTL_MS = 12 * HOUR;

function mfaSigningKey(): string {
  if (env.authSecret) return env.authSecret;
  if (env.isProduction) throw new Error("AUTH_SECRET is required.");
  return "dev-mfa-key";
}

function mfaSignature(userId: string, sessionVersion: number, exp: number): string {
  return createHmac("sha256", mfaSigningKey()).update(`mfa:${userId}:${sessionVersion}:${exp}`).digest("base64url");
}

/** Admin two-factor is required everywhere except the keyless demo. */
export function adminMfaRequired(): boolean {
  return env.mode !== "demo" || process.env.ADMIN_MFA === "required";
}

export async function hasFreshMfa(user: Pick<User, "id" | "sessionVersion">): Promise<boolean> {
  const value = (await cookies()).get(MFA_COOKIE)?.value ?? "";
  const [uid, exp, sig] = value.split(".");
  if (!uid || !exp || !sig || uid !== user.id || Number(exp) < Date.now()) return false;
  return safeEqual(sig, mfaSignature(user.id, user.sessionVersion, Number(exp)));
}

export async function grantMfaCookie(user: Pick<User, "id" | "sessionVersion">): Promise<void> {
  const exp = Date.now() + MFA_TTL_MS;
  (await cookies()).set(MFA_COOKIE, `${user.id}.${exp}.${mfaSignature(user.id, user.sessionVersion, exp)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.appUrl.startsWith("https://"),
    path: "/",
    maxAge: MFA_TTL_MS / 1000,
  });
}

export function readTotpSecret(user: Pick<User, "twoFactorSecret">): string | null {
  if (!user.twoFactorSecret) return null;
  return decryptJson<{ secret: string }>(user.twoFactorSecret).secret;
}

export function sealTotpSecret(secret: string): string {
  return encryptJson({ secret });
}

/** Check a code for an enrolled admin, with rate limiting and an audit trail. */
export async function checkAdminCode(user: User, code: string): Promise<boolean> {
  if (!(await hit("twoFactor", user.id))) return false;
  const secret = readTotpSecret(user);
  const ok = Boolean(secret && verifyTotp(secret, code));
  await audit(user.id, ok ? "security.mfa_passed" : "security.mfa_failed", "User", user.id);
  return ok;
}

/** An admin's not-yet-confirmed secret, created on first visit and shown once. */
export async function pendingTotpSecret(user: User): Promise<string | null> {
  if (user.twoFactorEnabledAt) return null;
  const existing = readTotpSecret(user);
  if (existing) return existing;
  const secret = newTotpSecret();
  await db.user.update({ where: { id: user.id }, data: { twoFactorSecret: sealTotpSecret(secret) } });
  return secret;
}
