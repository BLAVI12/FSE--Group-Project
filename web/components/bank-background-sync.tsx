"use client";

import Link from "next/link";
import { withRenewalNotice, type BankConnectionData } from "@/lib/bank-connection-state";
import { useBankSync } from "@/lib/use-bank-sync";

export function BankBackgroundSync({ configured, connection }: {
  configured: boolean;
  connection: BankConnectionData;
}) {
  const { busy, message, expired, renewal } = useBankSync({ configured, connection, mode: "background" });
  if (!busy && !message && !expired && !renewal) return null;
  return (
    <p className="mt-4 text-sm text-slate-600" role="status" aria-live="polite">
      {expired ? "Your bank permission needs renewal. Your saved data remains available."
        : withRenewalNotice(message, renewal, busy)}
      {(expired || (renewal && !busy)) && <> <Link href="/dashboard/bank" className="font-semibold text-emerald-800 underline focus-visible:outline-2 focus-visible:outline-emerald-700">Manage bank</Link></>}
    </p>
  );
}
