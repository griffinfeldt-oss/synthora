"use server";

import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn, signOut } from "@/auth";
import { db } from "@/lib/db";
import { clientIp, hit } from "@/lib/rate-limit";
import {
  checkAdminCode,
  grantMfaCookie,
  requestPasswordReset,
  resetPassword,
  sendVerificationEmail,
  verifyEmail,
} from "@/server/identity";
import { audit } from "@/server/notify";
import { currentUser, isAdmin } from "@/server/session";

type FormState = { ok: boolean; message: string } | null;

function safeNext(next: unknown, fallback = "/account"): string {
  const n = typeof next === "string" ? next : "";
  return n.startsWith("/") && !n.startsWith("//") ? n : fallback;
}

const TOO_MANY = "Too many attempts. Wait a few minutes and try again.";

export async function signInAction(_prev: unknown, formData: FormData) {
  if (!(await hit("signIn", await clientIp()))) return { message: TOO_MANY };
  try {
    await signIn("credentials", {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      redirectTo: safeNext(formData.get("next")),
    });
  } catch (e) {
    if (e instanceof AuthError) return { message: "That email and password don't match." };
    throw e; // NEXT_REDIRECT on success
  }
  return null;
}

const passwordSchema = z.string().min(10, "Use at least 10 characters").max(200);

const signUpSchema = z.object({
  name: z.string().trim().min(2, "Tell us your name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: passwordSchema,
});

export async function signUpAction(_prev: unknown, formData: FormData) {
  if (!(await hit("signUp", await clientIp()))) return { message: TOO_MANY };
  const parsed = signUpSchema.safeParse({ name: formData.get("name"), email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "Check the form." };
  const existing = await db.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) return { message: "An account with that email already exists. Try signing in or reset your password." };
  // The account starts unverified: no guest orders and no privileges until the
  // emailed link proves this person controls the address.
  const user = await db.user.create({
    data: { name: parsed.data.name, email: parsed.data.email, passwordHash: await bcrypt.hash(parsed.data.password, 12) },
  });
  await sendVerificationEmail(user.id);
  await audit(user.id, "security.signup", "User", user.id);
  await signIn("credentials", { email: parsed.data.email, password: parsed.data.password, redirectTo: safeNext(formData.get("next")) });
  return null;
}

export async function resendVerificationAction(_prev: FormState): Promise<FormState> {
  const user = await currentUser();
  if (!user) return { ok: false, message: "Sign in first." };
  const res = await sendVerificationEmail(user.id);
  if (res === "already") return { ok: true, message: "Your email is already confirmed." };
  if (res === "limited") return { ok: false, message: TOO_MANY };
  return { ok: true, message: `We sent a new link to ${user.email}.` };
}

export async function forgotPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await hit("passwordReset", await clientIp()))) return { ok: false, message: TOO_MANY };
  const email = z.string().trim().toLowerCase().email().safeParse(formData.get("email"));
  if (!email.success) return { ok: false, message: "Enter the email you signed up with." };
  await requestPasswordReset(email.data);
  // Same answer whether or not the account exists.
  return { ok: true, message: "If that email has an account, a reset link is on its way. It works for one hour." };
}

export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const password = passwordSchema.safeParse(formData.get("password"));
  if (!password.success) return { ok: false, message: password.error.issues[0]?.message ?? "Choose a longer password." };
  if (formData.get("password") !== formData.get("confirm")) return { ok: false, message: "The two passwords don't match." };
  const ok = await resetPassword(String(formData.get("token") ?? ""), password.data);
  if (!ok) return { ok: false, message: "This reset link has expired or was already used. Ask for a new one." };
  redirect("/sign-in?reset=1");
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}

export async function googleSignInAction(formData: FormData) {
  await signIn("google", { redirectTo: safeNext(formData.get("next")) });
}

// ─── Admin two-factor ────────────────────────────────────────────────────────

export async function twoFactorAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await currentUser();
  if (!user || !isAdmin(user)) return { ok: false, message: "Admins only." };
  const code = String(formData.get("code") ?? "");
  if (!(await checkAdminCode(user, code))) return { ok: false, message: "That code didn't match. Check your authenticator app's clock and try the newest code." };
  if (!user.twoFactorEnabledAt) {
    await db.user.update({ where: { id: user.id }, data: { twoFactorEnabledAt: new Date() } });
    await audit(user.id, "security.mfa_enrolled", "User", user.id);
  }
  await grantMfaCookie(user);
  redirect(safeNext(formData.get("next"), "/admin"));
}

export async function verifyEmailAction(formData: FormData) {
  const res = await verifyEmail(String(formData.get("token") ?? ""));
  redirect(res.ok ? `/account?verified=1&linked=${res.linkedOrders}` : "/verify-email?invalid=1");
}
