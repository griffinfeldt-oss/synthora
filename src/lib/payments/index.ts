import "server-only";
import { mock } from "@/lib/env";
import { MockGateway } from "./mock";
import { StripeGateway } from "./stripe";
import type { PaymentGateway } from "./types";

let gateway: PaymentGateway | null = null;

export function payments(): PaymentGateway {
  gateway ??= mock.stripe ? new MockGateway() : new StripeGateway();
  return gateway;
}

/** Tests swap in their own gateway. */
export function setPaymentGateway(g: PaymentGateway | null): void {
  gateway = g;
}

export type { PaymentGateway } from "./types";
