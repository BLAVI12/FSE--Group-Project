// The category menu on the Transactions page. "Automatic" saves no category,
// so the keyword rules choose one again; "Uncategorized" is a real category
// that stays as chosen. They must remain two distinct options.
const AUTOMATIC = "";

export function categoryMenuOptions(categories: { id: string; name: string }[]) {
  return [
    { value: AUTOMATIC, label: "Automatic" },
    ...categories.map((category) => ({ value: category.id, label: category.name })),
  ];
}

/** The category id to save for a menu choice; null hands it back to the rules. */
export function categoryIdToSave(menuValue: string): string | null {
  return menuValue === AUTOMATIC ? null : menuValue;
}
