/**
 * Whether a transaction counts towards a month's income and spending: only
 * booked ones, because a pending transaction can still change its amount or
 * disappear; no transfers between the user's own accounts, which are neither
 * income nor spending; and no excluded ones (known test bookings and the
 * user's own exclusion rules).
 *
 * The dashboard's monthly summary and chart and the Transactions page's trend
 * all use this rule, so their totals always agree. Pending transactions still
 * appear in the lists.
 */
export function countsTowardTotals(transaction: {
  status: string;
  is_transfer: boolean;
  is_excluded: boolean;
}): boolean {
  return (
    transaction.status === "BOOKED" &&
    !transaction.is_transfer &&
    !transaction.is_excluded
  );
}
