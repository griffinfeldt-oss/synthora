"use server";

import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { z } from "zod";
import { signIn, signOut } from "@/auth";
import { db } from "@/lib/db";

function safeNext(next: unknown): string {
  const n = typeof next === "string" ? next : "";
  return n.startsWith("/") && !n.startsWith("//") ? n : "/account";
}

export async function signInAction(_prev: unknown, formData: FormData) {
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

const signUpSchema = z.object({
  name: z.string().trim().min(2, "Tell us your name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(8, "Use at least 8 characters").max(200),
});

export async function signUpAction(_prev: unknown, formData: FormData) {
  const parsed = signUpSchema.safeParse({ name: formData.get("name"), email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "Check the form." };
  const existing = await db.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) return { message: "An account with that email already exists. Try signing in." };
  await db.user.create({ data: { name: parsed.data.name, email: parsed.data.email, passwordHash: await bcrypt.hash(parsed.data.password, 12) } });
  // Attach any guest orders placed with this email.
  const user = await db.user.findUniqueOrThrow({ where: { email: parsed.data.email } });
  await db.order.updateMany({ where: { email: parsed.data.email, buyerId: null }, data: { buyerId: user.id } });
  await signIn("credentials", { email: parsed.data.email, password: parsed.data.password, redirectTo: safeNext(formData.get("next")) });
  return null;
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}

export async function googleSignInAction(formData: FormData) {
  await signIn("google", { redirectTo: safeNext(formData.get("next")) });
}
