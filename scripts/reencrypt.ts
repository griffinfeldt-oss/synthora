/**
 * Re-encrypt every stored secret with the current ENCRYPTION_KEY, after setting
 * the old one as ENCRYPTION_KEY_PREVIOUS. Safe to run more than once.
 */
import { db } from "../src/lib/db";
import { decryptJson, encryptJson, isCurrentKey } from "../src/lib/crypto";

async function main() {
  if (!process.env.ENCRYPTION_KEY_PREVIOUS) throw new Error("Set ENCRYPTION_KEY_PREVIOUS to the old key first.");
  let partners = 0;
  for (const c of await db.partnerConnection.findMany()) {
    if (isCurrentKey(c.encryptedCredentials)) continue;
    await db.partnerConnection.update({ where: { id: c.id }, data: { encryptedCredentials: encryptJson(decryptJson(c.encryptedCredentials)) } });
    partners++;
  }
  let totp = 0;
  for (const u of await db.user.findMany({ where: { twoFactorSecret: { not: null } } })) {
    if (isCurrentKey(u.twoFactorSecret!)) continue;
    await db.user.update({ where: { id: u.id }, data: { twoFactorSecret: encryptJson(decryptJson(u.twoFactorSecret!)) } });
    totp++;
  }
  console.log(`Re-encrypted ${partners} partner connection(s) and ${totp} two-factor secret(s). You can now remove ENCRYPTION_KEY_PREVIOUS.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
