/**
 * Seller debts the platform decides not to recover. Writing one off moves it to
 * a platform loss in the ledger, with who decided and why.
 */
import "server-only";
import { db } from "@/lib/db";
import { writeLedger } from "./ledger";
import { audit } from "./notify";

export async function writeOffReceivable(adminId: string, receivableId: string, note: string): Promise<void> {
  const r = await db.sellerReceivable.findUniqueOrThrow({ where: { id: receivableId } });
  if (r.status !== "OPEN") throw new Error("Only open debts can be written off.");
  const remaining = r.amountCents - r.recoveredCents;
  if (remaining <= 0) throw new Error("Nothing left to write off; credits are paid out with the next payout.");
  await db.$transaction(async (tx) => {
    const res = await tx.sellerReceivable.updateMany({ where: { id: r.id, status: "OPEN" }, data: { status: "WRITTEN_OFF" } });
    if (res.count === 0) return;
    const base = { sellerId: r.sellerId, orderId: r.orderId, sellerOrderId: r.sellerOrderId };
    await writeLedger(
      tx,
      [
        { ...base, type: "WRITE_OFF", account: "SELLER", amountCents: remaining, memo: `Debt written off: ${note}`.slice(0, 200) },
        { ...base, type: "WRITE_OFF", account: "PLATFORM", amountCents: -remaining, memo: "Seller debt absorbed by the platform" },
      ],
      `write-off:${r.id}`,
    );
  });
  await audit(adminId, "receivable.written_off", "SellerReceivable", r.id, { remaining, note });
}
