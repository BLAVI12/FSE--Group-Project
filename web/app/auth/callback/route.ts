import { NextResponse, type NextRequest } from "next/server";
import { oauthErrorPath, safeInternalPath } from "@/lib/auth/redirects";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const flowId = request.nextUrl.searchParams.get("sb_flow_id");
  const next = safeInternalPath(request.nextUrl.searchParams.get("next"));
  const flow = request.nextUrl.searchParams.get("flow");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(
      code,
      flowId ? { flowId } : undefined,
    );

    if (!error) {
      return NextResponse.redirect(new URL(next, request.nextUrl.origin));
    }
  }

  const errorUrl = new URL(oauthErrorPath(flow), request.nextUrl.origin);
  errorUrl.searchParams.set("error", "oauth_callback_failed");
  return NextResponse.redirect(errorUrl);
}
