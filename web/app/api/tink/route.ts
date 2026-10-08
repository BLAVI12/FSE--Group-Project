import "server-only";
import pg from "pg";
import { after, NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { BankError, createBankWorkflow } from "@/lib/tink";
import {
  createTinkClient,
  tinkConfigFromEnv,
  TinkError,
} from "../../../../supabase/functions/_shared/tink/client.ts";

export const runtime = "nodejs";
export const maxDuration = 60;

const STATE_COOKIE = "tink_link_state";
const CALLBACK_PATH = "/api/tink";
const database = globalThis as typeof globalThis & { tinkPool?: pg.Pool };

// Only this server route reads the database password and Tink secret.
function bankWorkflow() {
  if (!process.env.DATABASE_URL) throw new BankError("NOT_CONFIGURED");
  if (!database.tinkPool) {
    const url = new URL(process.env.DATABASE_URL);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    url.searchParams.delete("sslmode");
    pg.types.setTypeParser(20, (value) => {
      const amount = Number(value);
      if (!Number.isSafeInteger(amount)) throw new BankError("UNSAFE_AMOUNT");
      return amount;
    });
    pg.types.setTypeParser(1082, (value) => value);
    database.tinkPool = new pg.Pool({
      connectionString: url.toString(),
      max: 2,
      idleTimeoutMillis: 5_000,
      connectionTimeoutMillis: 5_000,
      statement_timeout: 10_000,
      ssl: local
        ? false
        : { rejectUnauthorized: true, ca: process.env.DATABASE_CA_CERT },
    });
    database.tinkPool.on("error", () =>
      console.error("Bank database connection failed."),
    );
  }
  // Keep external calls below the function budget so failures can still be recorded cleanly.
  const deadline = AbortSignal.timeout(45_000);
  const tink = createTinkClient(tinkConfigFromEnv((name) => process.env[name]), {
    fetch: (input, init) =>
      fetch(input, {
        ...init,
        cache: "no-store",
        signal: AbortSignal.any([
          deadline,
          ...(init?.signal ? [init.signal] : []),
        ]),
      }),
  });
  return createBankWorkflow(database.tinkPool, tink);
}

async function signedInUser(request: NextRequest, mutation = true) {
  if (mutation && request.headers.get("origin") !== request.nextUrl.origin)
    return null;
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: active, error: statusError } = await supabase.rpc("is_account_active");
  return statusError || active !== true ? null : user;
}

function bankFailure(error: unknown) {
  console.error("Bank request failed.", {
    code: error instanceof BankError || error instanceof TinkError
      ? error.code
      : "DATABASE_OR_CONFIGURATION_ERROR",
  });
  return Response.json(
    { error: "Bank data could not be updated. Your saved data is still available." },
    { status: 502 },
  );
}

// POST starts Link or refreshes data; GET handles the return from Tink Link.
export async function POST(request: NextRequest) {
  const user = await signedInUser(request);
  if (!user)
    return Response.json({ error: "Please sign in again." }, { status: 401 });
  const action = request.nextUrl.searchParams.get("action");
  if (action !== "connect" && action !== "sync")
    return Response.json({ error: "Unknown bank action." }, { status: 400 });
  try {
    const workflow = bankWorkflow();
    if (action === "sync") {
      return Response.json(await workflow.sync(
        user.id,
        request.nextUrl.searchParams.get("manual") === "true",
      ));
    }
    const link = await workflow.startConnect(
      user.id,
      user.email ?? "Finance Planner user",
      request.nextUrl.searchParams.get("renew") === "true",
    );
    const response = NextResponse.json({ redirectUrl: link.redirectUrl });
    response.cookies.set(STATE_COOKIE, link.state, {
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      path: CALLBACK_PATH,
      maxAge: 600,
    });
    return response;
  } catch (error) {
    return bankFailure(error);
  }
}

export async function GET(request: NextRequest) {
  const user = await signedInUser(request, false);

  if (request.nextUrl.searchParams.get("action") === "status") {
    if (!user)
      return Response.json({ error: "Please sign in again." }, { status: 401 });
    try {
      return Response.json(await bankWorkflow().status(user.id));
    } catch (error) {
      return bankFailure(error);
    }
  }

  let outcome = "failed";
  if (user) {
    try {
      outcome = await bankWorkflow().finishConnect(
        user.id,
        request.nextUrl.searchParams,
        request.cookies.get(STATE_COOKIE)?.value,
      );
      if (outcome === "connected") {
        // Next keeps this request alive on Vercel until the post-response work finishes
        // (within maxDuration), instead of relying on an unsafe fire-and-forget promise.
        after(async () => {
          try {
            await bankWorkflow().sync(user.id);
          } catch (error) {
            console.error("Background bank sync failed.", {
              code: error instanceof BankError || error instanceof TinkError
                ? error.code
                : "DATABASE_OR_CONFIGURATION_ERROR",
            });
          }
        });
      }
    } catch (error) {
      bankFailure(error);
    }
  }
  const url = new URL(user ? "/dashboard" : "/login", request.nextUrl.origin);
  url.searchParams.set("bank", user ? outcome : "login_required");
  const response = NextResponse.redirect(url);
  response.cookies.set(STATE_COOKIE, "", { path: CALLBACK_PATH, maxAge: 0 });
  return response;
}
