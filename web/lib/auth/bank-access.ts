import type { SupabaseClient } from "@supabase/supabase-js";
import { bankPhase } from "../bank-connection-state.ts";
import { loadOwnBankConnection } from "../data/bank.ts";
import { requiresBankSetup } from "./routes.ts";

export async function bankAccessDecision(
  supabase: SupabaseClient,
  userId: string,
  pathname: string,
): Promise<"allow" | "setup" | "unavailable"> {
  if (!requiresBankSetup(pathname)) return "allow";
  try {
    return bankPhase(await loadOwnBankConnection(supabase, userId)) === "ready" ? "allow" : "setup";
  } catch {
    return "unavailable";
  }
}

export function bankAccessProblem(decision: "setup" | "unavailable") {
  return decision === "setup"
    ? { status: 403, body: { error: "Please finish connecting your bank before using transactions.", code: "BANK_SETUP_REQUIRED", setupUrl: "/dashboard/bank" } }
    : { status: 503, body: { error: "Your bank connection could not be verified. Please try again.", code: "BANK_UNAVAILABLE", setupUrl: "/dashboard/bank" } };
}
