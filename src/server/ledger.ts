import "server-only";
import type { LedgerType, Prisma } from "@prisma/client";

/**
 * Ledger accounts. Each money movement writes balanced rows:
 *  PLATFORM  – our revenue (commission, subscriptions, reversals of those)
 *  SELLER    – what we owe a seller; a seller order's SELLER rows sum to what is
 *              still owed on it (negative: the seller owes us, see SellerReceivable)
 *  CASH      – the platform's Stripe balance (charges in, transfers/refunds/fees out)
 *  TAX       – sales tax collected for remittance by the platform
 */
export type LedgerAccount = "PLATFORM" | "SELLER" | "CASH" | "TAX";

export interface LedgerRow {
  type: LedgerType;
  account: LedgerAccount;
  amountCents: number;
  sellerId?: string | null;
  orderId?: string | null;
  sellerOrderId?: string | null;
  stripeRef?: string | null;
  memo?: string;
}

/**
 * Append rows for one business operation. `opKey` names the operation; rows get
 * (opKey, seq) which is unique, so writing the same operation twice fails the
 * transaction instead of double-posting.
 */
export async function writeLedger(tx: Prisma.TransactionClient, rows: LedgerRow[], opKey?: string): Promise<void> {
  const data = rows.filter((r) => r.amountCents !== 0).map((r, seq) => ({ ...r, opKey: opKey ?? null, seq: opKey ? seq : 0 }));
  if (data.length) await tx.ledgerEntry.createMany({ data });
}
