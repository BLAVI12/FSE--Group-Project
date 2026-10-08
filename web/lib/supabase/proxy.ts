import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "./config";

const protectedRoutes = ["/dashboard"];
const guestOnlyRoutes = ["/login", "/register"];

function matchesRoute(pathname: string, routes: string[]) {
  return routes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

function redirectWithRefreshedCookies(url: URL, response: NextResponse) {
  const redirectResponse = NextResponse.redirect(url);

  response.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie);
  });

  return redirectResponse;
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, publishableKey } = getSupabaseConfig();

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({ request });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const isAuthenticated = Boolean(data?.claims);
  const pathname = request.nextUrl.pathname;

  if (isAuthenticated) {
    const { data: active, error } = await supabase.rpc("is_account_active");
    if (error || active !== true) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Account access is unavailable." }, { status: 403 });
      }
      if (matchesRoute(pathname, protectedRoutes) || matchesRoute(pathname, guestOnlyRoutes)) {
        const blockedUrl = request.nextUrl.clone();
        blockedUrl.pathname = "/account-unavailable";
        blockedUrl.search = "";
        return redirectWithRefreshedCookies(blockedUrl, response);
      }
    }
  }

  if (!isAuthenticated && matchesRoute(pathname, protectedRoutes)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return redirectWithRefreshedCookies(loginUrl, response);
  }

  if (isAuthenticated && matchesRoute(pathname, guestOnlyRoutes)) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    dashboardUrl.search = "";
    return redirectWithRefreshedCookies(dashboardUrl, response);
  }

  return response;
}
