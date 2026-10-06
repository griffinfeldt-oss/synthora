import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { hit } from "@/lib/rate-limit";

declare module "next-auth" {
  interface Session {
    user: { id: string; sv: number } & DefaultSession["user"];
  }
}

const credentialsSchema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase().trim()),
  password: z.string().min(1),
});

async function logSecurity(action: string, targetId: string, meta?: Record<string, unknown>) {
  await db.auditLog.create({ data: { actorId: null, action, targetType: "User", targetId, meta: meta as object | undefined } }).catch(() => undefined);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt" },
  pages: { signIn: "/sign-in" },
  trustHost: true,
  providers: [
    Credentials({
      credentials: { email: { label: "Email" }, password: { label: "Password", type: "password" } },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        // Per-account limit here as well as per-IP in the sign-in action, because this
        // endpoint can also be called directly.
        if (!(await hit("signInPerEmail", parsed.data.email))) {
          await logSecurity("security.signin_limited", parsed.data.email);
          return null;
        }
        const user = await db.user.findUnique({ where: { email: parsed.data.email } });
        const ok = user?.passwordHash ? await bcrypt.compare(parsed.data.password, user.passwordHash) : false;
        if (!user || !ok) {
          await logSecurity("security.signin_failed", parsed.data.email);
          return null;
        }
        return { id: user.id, email: user.email, name: user.name, sv: user.sessionVersion };
      },
    }),
    ...(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET ? [Google({ allowDangerousEmailAccountLinking: false })] : []),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) {
        token.uid = user.id;
        token.sv = (user as { sv?: number; sessionVersion?: number }).sv ?? (user as { sessionVersion?: number }).sessionVersion ?? 0;
      }
      return token;
    },
    session({ session, token }) {
      if (token.uid && session.user) {
        session.user.id = token.uid as string;
        session.user.sv = (token.sv as number | undefined) ?? 0;
      }
      return session;
    },
  },
  events: {
    // Google only signs in with addresses it has verified, which proves mailbox control.
    async signIn({ user, account, profile }) {
      if (account?.provider === "google" && user.id && (profile as { email_verified?: boolean } | undefined)?.email_verified) {
        const u = await db.user.update({ where: { id: user.id }, data: { emailVerified: new Date() } }).catch(() => null);
        if (u) await db.order.updateMany({ where: { email: u.email, buyerId: null }, data: { buyerId: u.id } });
      }
    },
  },
});

export const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
