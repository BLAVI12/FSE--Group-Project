/**
 * Works out how one account's stored transactions must change to match what
 * Tink returned. Pure: no database, so every rule is unit-testable.
 *
 * A transaction is identified by its content (migration 005): booking date,
 * amount and description, plus an occurrence number for identical entries on
 * the same day. Tink Demo Bank's providerTransactionId is a position (newest =
 * 1001) that shifts whenever new transactions arrive, so it cannot be the
 * identity. It remains a fallback for rows whose content changed.
 *
 *   1. Pair by content. Identical same-day entries pair up in order.
 *   2. Pair what is left by Tink's id: a bank with stable ids correcting a
 *      booked description, or a pending row booking with a new amount. Only
 *      when the two also share the merchant, or the amount and date: Demo
 *      Bank hands a vanished row's id to an unrelated newer transaction.
 *   3. Insert what is still unmatched from Tink. Delete stored PENDING rows
 *      Tink no longer returns. Keep stored BOOKED rows: real banks only return
 *      about 90 days, and older history must stay.
 *
 * A paired row keeps its database id, so a user's category stays on the right
 * transaction however Tink renumbers.
 */

export interface TransactionValues {
  providerTransactionId: string;
  amount: number;
  currency: string;
  description: string;
  bookedDate: string;
  status: "BOOKED" | "PENDING";
  isTransfer: boolean;
}

export interface StoredTransaction extends TransactionValues {
  id: string;
  occurrence: number;
}

export interface PlannedUpdate {
  id: string;
  values: TransactionValues & { occurrence: number };
  /** "changed": a field the user can see differs. "renumbered": only Tink's id moved. */
  kind: "changed" | "renumbered";
}

export interface TransactionPlan {
  inserts: (TransactionValues & { occurrence: number })[];
  updates: PlannedUpdate[];
  deletes: string[];
}

const contentKey = (t: Pick<TransactionValues, "bookedDate" | "amount" | "description">) =>
  `${t.bookedDate}|${t.amount}|${t.description}`;

const byProviderId = (a: TransactionValues, b: TransactionValues) =>
  a.providerTransactionId.localeCompare(b.providerTransactionId, "en", { numeric: true });

export function planTransactions(stored: StoredTransaction[], incoming: TransactionValues[]): TransactionPlan {
  // The same transaction can arrive twice when two consents cover one account
  // (same Tink id, same content). Two genuine identical coffees have different ids.
  const seen = new Set<string>();
  const fromTink = [...incoming].sort(byProviderId).filter((t) => {
    const key = `${t.providerTransactionId}|${contentKey(t)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // 1. Pair by content.
  const storedByContent = new Map<string, StoredTransaction[]>();
  for (const s of [...stored].sort((a, b) => a.occurrence - b.occurrence)) {
    const group = storedByContent.get(contentKey(s)) ?? [];
    group.push(s);
    storedByContent.set(contentKey(s), group);
  }
  const pairs: [StoredTransaction, TransactionValues][] = [];
  const unpairedFromTink: TransactionValues[] = [];
  for (const t of fromTink) {
    const match = storedByContent.get(contentKey(t))?.shift();
    if (match) pairs.push([match, t]);
    else unpairedFromTink.push(t);
  }

  // 2. Pair the rest by Tink's id, if the rows plausibly are one transaction.
  const leftoverByProviderId = new Map<string, StoredTransaction>();
  for (const group of storedByContent.values()) {
    for (const s of group) {
      if (!leftoverByProviderId.has(s.providerTransactionId)) leftoverByProviderId.set(s.providerTransactionId, s);
    }
  }
  const plausiblySame = (s: StoredTransaction, t: TransactionValues) =>
    s.description === t.description || (s.amount === t.amount && s.bookedDate === t.bookedDate);
  const newFromTink: TransactionValues[] = [];
  for (const t of unpairedFromTink) {
    const match = leftoverByProviderId.get(t.providerTransactionId);
    if (match && plausiblySame(match, t)) {
      pairs.push([match, t]);
      leftoverByProviderId.delete(t.providerTransactionId);
    } else {
      newFromTink.push(t);
    }
  }

  // Occurrence slots: every slot held at the start of this sync stays taken,
  // even one a row is about to leave, so no statement order can collide.
  const highest = new Map<string, number>();
  for (const s of stored) highest.set(contentKey(s), Math.max(highest.get(contentKey(s)) ?? 0, s.occurrence));
  const nextSlot = (t: TransactionValues) => {
    const slot = (highest.get(contentKey(t)) ?? 0) + 1;
    highest.set(contentKey(t), slot);
    return slot;
  };

  const updates: PlannedUpdate[] = [];
  for (const [s, t] of pairs) {
    const occurrence = contentKey(s) === contentKey(t) ? s.occurrence : nextSlot(t);
    const changed =
      s.amount !== t.amount || s.currency !== t.currency || s.description !== t.description ||
      s.bookedDate !== t.bookedDate || s.status !== t.status || s.isTransfer !== t.isTransfer;
    if (changed) updates.push({ id: s.id, values: { ...t, occurrence }, kind: "changed" });
    else if (s.providerTransactionId !== t.providerTransactionId) {
      updates.push({ id: s.id, values: { ...t, occurrence }, kind: "renumbered" });
    }
  }

  // 3. Insert the new, drop vanished pending rows, keep booked history.
  const inserts = newFromTink.map((t) => ({ ...t, occurrence: nextSlot(t) }));
  const paired = new Set(pairs.map(([s]) => s.id));
  const deletes = stored.filter((s) => !paired.has(s.id) && s.status === "PENDING").map((s) => s.id);

  return { inserts, updates, deletes };
}
