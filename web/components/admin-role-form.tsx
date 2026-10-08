"use client";

import { useActionState } from "react";
import {
  updateUserRole,
  type RoleFormState,
} from "@/app/dashboard/admin/actions";
import type { AppRole } from "@/lib/data/profile";

const initialState: RoleFormState = { status: "idle", message: "" };

export function AdminRoleForm({
  userId,
  role,
}: {
  userId: string;
  role: AppRole;
}) {
  const action = updateUserRole.bind(null, userId);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`role-${userId}`}>
        Role
      </label>
      <select
        id={`role-${userId}`}
        name="role"
        defaultValue={role}
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-50"
      >
        <option value="user">User</option>
        <option value="admin">Admin</option>
      </select>
      <button
        type="submit"
        disabled={pending}
        className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Saving…" : "Update"}
      </button>
      {state.message ? (
        <span
          role={state.status === "error" ? "alert" : "status"}
          className={
            state.status === "error"
              ? "w-full text-xs text-rose-700"
              : "w-full text-xs text-emerald-700"
          }
        >
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
