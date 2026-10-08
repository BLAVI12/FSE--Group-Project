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
        className="rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white"
      >
        <option value="user">User</option>
        <option value="admin">Admin</option>
      </select>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-white/20 px-3 py-2 text-sm font-semibold transition hover:bg-white/10 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Update"}
      </button>
      {state.message ? (
        <span
          role={state.status === "error" ? "alert" : "status"}
          className={
            state.status === "error"
              ? "w-full text-xs text-red-300"
              : "w-full text-xs text-emerald-300"
          }
        >
          {state.message}
        </span>
      ) : null}
    </form>
  );
}

