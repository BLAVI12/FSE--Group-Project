import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "./config";
import { profileAccessDecision } from "../auth/profile-completion";
import { bankAccessDecision, bankAccessProblem } from "../auth/bank-access";
import { protectedRoutes, guestOnlyRoutes, matchesRoute, profileRoute, bankRoute } from "../auth/routes";

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
    if (!error && active === true && data?.claims?.sub) {
      const decision = await profileAccessDecision(supabase, data.claims.sub, pathname);
      if (decision !== "allow") {
        if (pathname.startsWith("/api/")) {
          return NextResponse.json({ error: decision === "complete"
            ? "Please complete your username, first name and last name in your profile."
            : "Your profile could not be verified." }, { status: 403 });
        }
        const profileUrl = request.nextUrl.clone();
        profileUrl.pathname = profileRoute;
        profileUrl.search = "";
        return redirectWithRefreshedCookies(profileUrl, response);
      }
      const bankDecision = await bankAccessDecision(supabase, data.claims.sub, pathname);
      if (bankDecision !== "allow") {
        if (pathname.startsWith("/api/")) {
          const problem = bankAccessProblem(bankDecision);
          return NextResponse.json(problem.body, { status: problem.status, headers: { "Cache-Control": "no-store" } });
        }
        const bankUrl = request.nextUrl.clone();
        bankUrl.pathname = bankRoute;
        bankUrl.search = bankDecision === "unavailable" ? "?bank=unavailable" : "";
        return redirectWithRefreshedCookies(bankUrl, response);
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
