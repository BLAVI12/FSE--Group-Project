import "server-only";
import { missingBankSettings } from "./bank-settings";

export function isBankConfigured() {
  const missing = missingBankSettings(process.env);
  if (missing.length > 0) {
    // Keep main's diagnostics for both bank management and background sync.
    // Report variable names only; never log connection strings or credentials.
    console.warn("Bank connection unavailable; missing or unusable settings:", missing.join(", "));
  }
  return missing.length === 0;
}
