"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export interface CartLine {
  listingId: string;
  variantId: string | null;
  quantity: number;
  /** Snapshot for instant display; the server re-prices at checkout. */
  title: string;
  priceCents: number;
  variantName?: string | null;
  digital?: boolean;
}

interface CartContextValue {
  lines: CartLine[];
  count: number;
  ready: boolean;
  add: (line: CartLine) => void;
  update: (listingId: string, variantId: string | null, quantity: number) => void;
  remove: (listingId: string, variantId: string | null) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);
const KEY = "synthora_cart_v1";

function read(): CartLine[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as CartLine[]) : [];
    return Array.isArray(parsed) ? parsed.filter((l) => l && typeof l.listingId === "string") : [];
  } catch {
    return [];
  }
}

function write(lines: CartLine[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(lines));
  } catch {
    // storage unavailable (private mode); cart lives in memory for this visit
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setLines(read());
    setReady(true);
    const onStorage = (e: StorageEvent) => e.key === KEY && setLines(read());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const commit = useCallback((next: CartLine[]) => {
    setLines(next);
    write(next);
  }, []);

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      ready,
      count: lines.reduce((a, l) => a + l.quantity, 0),
      add: (line) => {
        const existing = lines.find((l) => l.listingId === line.listingId && l.variantId === line.variantId);
        if (existing) {
          commit(
            lines.map((l) =>
              l === existing ? { ...l, quantity: l.digital ? 1 : Math.min(20, l.quantity + line.quantity) } : l,
            ),
          );
        } else {
          commit([...lines, { ...line, quantity: line.digital ? 1 : line.quantity }]);
        }
      },
      update: (listingId, variantId, quantity) =>
        commit(
          lines
            .map((l) => (l.listingId === listingId && l.variantId === variantId ? { ...l, quantity: Math.max(0, Math.min(20, quantity)) } : l))
            .filter((l) => l.quantity > 0),
        ),
      remove: (listingId, variantId) => commit(lines.filter((l) => !(l.listingId === listingId && l.variantId === variantId))),
      clear: () => commit([]),
    }),
    [lines, ready, commit],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}
