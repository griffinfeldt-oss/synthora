import { db } from "@/lib/db";

export async function resetDb() {
  const tables = await db.$queryRawUnsafe<Array<{ tablename: string }>>(
    `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`,
  );
  if (tables.length) await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
}

/** A ready-to-sell seller with demo partner connections. */
export async function makeSeller(slug: string, opts: { selfShip?: boolean; digital?: boolean } = {}) {
  const user = await db.user.create({ data: { email: `${slug}@test.local`, name: slug } });
  return db.seller.create({
    data: {
      userId: user.id,
      shopName: slug,
      slug,
      status: "APPROVED",
      stripeAccountId: `acct_test_${slug}`,
      payoutsEnabled: true,
      chargesEnabled: true,
      detailsSubmitted: true,
      stripeCustomerId: `cus_test_${slug}`,
      subscriptionStatus: "ACTIVE",
      offersSelfShip: opts.selfShip ?? false,
      offersDigital: opts.digital ?? false,
    },
  });
}
