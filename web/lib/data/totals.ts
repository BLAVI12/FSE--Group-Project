/**
 * Whether a transaction counts towards a month's income and spending: only
 * booked ones, because a pending transaction can still change its amount or
 * disappear, and no transfers between the user's own accounts, which are
 * neither income nor spending.
 *
 * The monthly summary and the spending chart both use this rule, so their
 * totals always agree. Pending transactions still appear in the lists.
 */
export function countsTowardTotals(transaction: {
  status: string;
  is_transfer: boolean;
}): boolean {
  return transaction.status === "BOOKED" && !transaction.is_transfer;
}
