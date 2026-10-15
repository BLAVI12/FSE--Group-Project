import type { SupabaseClient } from "@supabase/supabase-js";
import type { BankConnectionData } from "../bank-connection-state.ts";

export class BankDataError extends Error {}

export async function loadOwnBankConnection(
  supabase: SupabaseClient,
  userId: string,
): Promise<BankConnectionData | null> {
  try {
    const { data, error } = await supabase.from("connections")
      .select("status,live_sync_enabled,last_synced")
      .eq("user_id", userId).eq("provider", "tink").maybeSingle();
    if (error) throw new BankDataError("Your bank connection could not be verified.");
    if (!data) return null;
    if (!["ACTIVE", "EXPIRED", "ERROR"].includes(data.status) ||
      typeof data.live_sync_enabled !== "boolean" ||
      (data.last_synced !== null && (typeof data.last_synced !== "string" ||
        !Number.isFinite(Date.parse(data.last_synced))))) {
      throw new BankDataError("Your bank connection could not be verified.");
    }
    return data as BankConnectionData;
  } catch {
    // Never turn a failed read into an apparently empty connection.
    throw new BankDataError("Your bank connection could not be verified.");
  }
}
