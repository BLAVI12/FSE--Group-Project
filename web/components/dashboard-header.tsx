import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLink } from "@/components/brand/brand-link";
import { LogoutButton } from "@/components/logout-button";
import { ProfileMenu } from "@/components/profile-menu";
import { dashboardNavigationItems, type DashboardPage } from "@/lib/dashboard-navigation";

export function DashboardHeader({
  activePage,
  greeting,
  showAdmin = false,
}: {
  activePage: DashboardPage;
  greeting: ReactNode;
  showAdmin?: boolean;
}) {
  return (
    <header className="border-b border-slate-100 bg-white">
      <nav aria-label="Dashboard navigation" className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-5">
        <div className="order-1 min-w-0 flex-1">
          <BrandLink />
          {greeting}
        </div>
        <div className="order-3 flex w-full flex-wrap items-center gap-2 sm:order-2 sm:w-auto">
          {dashboardNavigationItems(activePage, showAdmin).map((item) => (
            <Link
              key={item.page}
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              className={`rounded-full px-4 py-2 text-sm transition focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700 ${
                item.active
                  ? "bg-emerald-50 font-semibold text-emerald-800"
                  : "font-medium text-slate-600 hover:bg-slate-50 hover:text-emerald-800"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
        <div className="order-2 sm:order-3">
          <ProfileMenu active={activePage === "profile"}>
            <LogoutButton className="w-full rounded-xl px-3 py-3 text-left text-sm font-semibold text-slate-600 transition hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-2 focus-visible:outline-emerald-700" />
          </ProfileMenu>
        </div>
      </nav>
    </header>
  );
}
