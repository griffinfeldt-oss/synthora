/**
 * Admin access is granted here, by someone with database access, never by an
 * email address in configuration.
 *
 *   npm run admin:grant -- person@example.com     make a verified account an admin
 *   npm run admin:revoke -- person@example.com    remove admin
 *   npm run admin:reset-2fa -- person@example.com clear their authenticator (lost device)
 */
import { db } from "../src/lib/db";

async function main() {
  const [cmd, emailArg] = process.argv.slice(2);
  const email = (emailArg ?? "").trim().toLowerCase();
  if (!["grant", "revoke", "reset-2fa"].includes(cmd) || !email) {
    console.error("Usage: admin.ts grant|revoke|reset-2fa <email>");
    process.exit(1);
  }
  const user = await db.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No account for ${email}. They need to sign up first.`);
  if (cmd === "grant") {
    if (!user.emailVerified) throw new Error(`${email} has not confirmed their email yet. Admin is only granted to confirmed accounts.`);
    await db.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
    console.log(`${email} is now an admin. They will set up two-step sign-in on their first visit to /admin.`);
  } else if (cmd === "revoke") {
    await db.user.update({ where: { id: user.id }, data: { role: "BUYER", sessionVersion: { increment: 1 } } });
    console.log(`${email} is no longer an admin and has been signed out everywhere.`);
  } else {
    await db.user.update({ where: { id: user.id }, data: { twoFactorSecret: null, twoFactorEnabledAt: null, sessionVersion: { increment: 1 } } });
    console.log(`Two-step sign-in reset for ${email}. They will enrol again on next admin visit.`);
  }
  await db.auditLog.create({ data: { actorId: null, action: `admin.${cmd}`, targetType: "User", targetId: user.id, meta: { via: "cli" } } });
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
