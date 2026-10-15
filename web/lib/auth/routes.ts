export const protectedRoutes = ["/dashboard"];
export const guestOnlyRoutes = ["/login", "/register"];
export const profileRoute = "/dashboard/profile";
export const bankRoute = "/dashboard/bank";

export function matchesRoute(pathname: string, routes: readonly string[]) {
  return routes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export function requiresProfileCompletion(pathname: string) {
  return pathname !== profileRoute && (
    matchesRoute(pathname, protectedRoutes) ||
    matchesRoute(pathname, guestOnlyRoutes) ||
    matchesRoute(pathname, ["/api"])
  );
}

export function requiresBankSetup(pathname: string) {
  return pathname === "/dashboard" || pathname === "/dashboard/" ||
    matchesRoute(pathname, ["/dashboard/transactions", "/api/transactions"]) ||
    matchesRoute(pathname, guestOnlyRoutes);
}
