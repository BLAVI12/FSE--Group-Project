export type DashboardPage = "overview" | "transactions" | "profile" | "admin" | "bank";

export function dashboardNavigationItems(activePage: DashboardPage, showAdmin = false, showFinancial = true) {
  const items: { page: DashboardPage; label: string; href: string }[] = showFinancial ? [
    { page: "overview", label: "Overview", href: "/dashboard" },
    { page: "transactions", label: "Transactions", href: "/dashboard/transactions" },
  ] : [];

  if (showAdmin) {
    items.push({ page: "admin", label: "Admin", href: "/dashboard/admin" });
  }

  return items.map((item) => ({ ...item, active: item.page === activePage }));
}
