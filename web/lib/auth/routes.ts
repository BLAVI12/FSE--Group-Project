export const protectedRoutes = ["/dashboard"];
export const guestOnlyRoutes = ["/login", "/register"];
export const profileRoute = "/dashboard/profile";

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
