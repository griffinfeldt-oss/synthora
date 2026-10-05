import "server-only";
import type { LedgerType, Prisma } from "@prisma/client";

/**
 * Ledger accounts. Each money movement writes balanced rows:
 *  PLATFORM  – our revenue (commission, subscriptions, reversals of those)
 *  SELLER    – what we owe a seller; a seller order's SELLER rows sum to its net
 *  CASH      – the platform's Stripe balance (charges in, transfers/refunds/fees out)
 */
export type LedgerAccount = "PLATFORM" | "SELLER" | "CASH";

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

export async function writeLedger(tx: Prisma.TransactionClient, rows: LedgerRow[]): Promise<void> {
  const data = rows.filter((r) => r.amountCents !== 0);
  if (data.length) await tx.ledgerEntry.createMany({ data });
}
