"use client";

import { useActionState } from "react";
import { updateUserStatus, type RoleFormState } from "@/app/dashboard/admin/actions";

const initial: RoleFormState = { status: "idle", message: "" };

export function AdminStatusForm({ userId, status }: { userId: string; status: "active" | "suspended" }) {
  const [state, action, pending] = useActionState(updateUserStatus.bind(null, userId), initial);
  const suspending = status === "active";
  return (
    <details className="min-w-48">
      <summary className="cursor-pointer rounded-lg text-sm font-semibold text-emerald-800 focus-visible:outline-2">
        {suspending ? "Suspend account" : "Reactivate account"}
      </summary>
      <form action={action} className="mt-3 space-y-3">
        <input type="hidden" name="status" value={suspending ? "suspended" : "active"} />
        <label className="block text-sm" htmlFor={`reason-${userId}`}>Reason (no financial or sensitive personal data)</label>
        <textarea id={`reason-${userId}`} name="reason" required maxLength={500} rows={3}
          className="w-full rounded-lg border border-slate-300 p-2" />
        <label className="flex gap-2 text-sm">
          <input type="checkbox" name="confirmed" required />
          {suspending ? "Confirm access suspension; saved data is retained." : "Confirm restoration of account access."}
        </label>
        <button disabled={pending} className="rounded-full bg-emerald-700 px-4 py-2 text-sm text-white disabled:opacity-60">
          {pending ? "Saving…" : "Confirm change"}
        </button>
        {state.message && <p role={state.status === "error" ? "alert" : "status"} className="text-sm">{state.message}</p>}
      </form>
    </details>
  );
}
