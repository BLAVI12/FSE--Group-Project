/**
 * Converts what Tink sends into the shape our tables store. Pure: no network,
 * no database, so every rule is unit-testable and runs unchanged in Supabase
 * Edge Functions (Deno) and in the Node test runner.
 *
 * Ownership is not decided here. A converted account or transaction has no
 * user: the sync attaches it to the user's connection, and the database fills
 * in user_id from that parent row (migration 007).
 */

import type { TransactionValues } from "./reconcile.ts";

export interface TinkAmountValue {
  unscaledValue: string;
  scale: string | number;
}

export interface TinkAccount {
  id: string;
  name: string;
  type: string;
  balances?: {
    booked?: { amount?: { value?: TinkAmountValue; currencyCode?: string } };
    available?: { amount?: { value?: TinkAmountValue; currencyCode?: string } };
  };
  identifiers?: { iban?: { iban?: string } };
  dates?: { lastRefreshed?: string };
}

export interface TinkTransaction {
  id: string;
  accountId: string;
  amount?: { value?: TinkAmountValue; currencyCode?: string };
  descriptions?: { display?: string; original?: string };
  dates?: { booked?: string };
  identifiers?: { providerTransactionId?: string };
  status?: string;
}

export type AccountType = "CHECKING" | "SAVINGS" | "CREDIT_CARD" | "OTHER";

/** An account as the accounts table stores it (without connection and user). */
export interface AccountValues {
  providerAccountId: string;
  iban: string | null;
  name: string;
  type: AccountType;
  balanceBooked: number | null;
  balanceAvailable: number | null;
  currency: string;
  lastRefreshed: string | null;
}

/**
 * Tink's { unscaledValue, scale } as exact integer cents.
 *
 * The scale varies per record: E.ON arrives as unscaledValue -340 with
 * scale 1, which is -34.00 EUR (-3400 cents), not -3.40. Computed with BigInt,
 * never floating point. Scales above 2 round half away from zero.
 */
export function toCents(value: TinkAmountValue | undefined): number | null {
  if (!value || !/^-?\d+$/.test(value.unscaledValue)) return null;
  const scale = Number(value.scale);
  if (!Number.isInteger(scale) || scale < 0) return null;

  let cents = BigInt(value.unscaledValue);
  if (scale < 2) cents *= 10n ** BigInt(2 - scale);
  if (scale > 2) {
    const divisor = 10n ** BigInt(scale - 2);
    const quotient = cents / divisor;
    const remainder = cents % divisor;
    cents = quotient + (remainder * 2n >= divisor ? 1n : remainder * 2n <= -divisor ? -1n : 0n);
  }

  const result = Number(cents);
  if (!Number.isSafeInteger(result)) throw new Error("Tink amount exceeds the safe integer range");
  return result;
}

/**
 * Tink sends BOOKED or PENDING. Anything else (missing, UNDEFINED, a value
 * added later) is treated as PENDING: it stays visible, never counts as
 * settled money, updates in place if it later books, and is cleaned up if it
 * vanishes. `known` lets the sync count and log these.
 */
export function transactionStatus(value: string | undefined): { status: "BOOKED" | "PENDING"; known: boolean } {
  if (value === "BOOKED" || value === "PENDING") return { status: value, known: true };
  return { status: "PENDING", known: false };
}

export function accountType(value: string): AccountType {
  if (value === "CHECKING" || value === "SAVINGS" || value === "CREDIT_CARD") return value;
  return "OTHER";
}

/**
 * Internal transfers appear twice, once on each account, so they are flagged
 * and left out of spending totals. Detection is by description (Übertrag,
 * Uebertrag, Ubertrag) and therefore fallible.
 */
export function isTransfer(description: string): boolean {
  const normalised = description
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  return normalised.includes("ubertrag") || normalised.includes("uebertrag");
}

export function toAccountValues(account: TinkAccount): AccountValues {
  const booked = account.balances?.booked?.amount;
  const available = account.balances?.available?.amount;
  return {
    providerAccountId: account.id,
    iban: account.identifiers?.iban?.iban ?? null,
    name: account.name,
    type: accountType(account.type),
    balanceBooked: toCents(booked?.value),
    balanceAvailable: toCents(available?.value),
    currency: booked?.currencyCode ?? available?.currencyCode ?? "EUR",
    lastRefreshed: account.dates?.lastRefreshed ?? null,
  };
}

/**
 * One Tink transaction as a transactions row, or null when it lacks what a
 * row needs (an id, an amount, a booking date); the sync skips those.
 * The description is Tink's cleaned-up `display` text, falling back to the
 * bank's `original`.
 */
export function toTransactionValues(
  transaction: TinkTransaction
): { values: TransactionValues; knownStatus: boolean } | null {
  const providerTransactionId = transaction.identifiers?.providerTransactionId;
  const amount = toCents(transaction.amount?.value);
  const bookedDate = transaction.dates?.booked;
  if (!providerTransactionId || amount === null || !bookedDate) return null;

  const description = transaction.descriptions?.display ?? transaction.descriptions?.original ?? "";
  const { status, known } = transactionStatus(transaction.status);
  return {
    values: {
      providerTransactionId,
      amount,
      currency: transaction.amount?.currencyCode ?? "EUR",
      description,
      bookedDate,
      status,
      isTransfer: isTransfer(description),
    },
    knownStatus: known,
  };
}
