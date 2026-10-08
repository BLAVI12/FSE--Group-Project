"use client";

import {
  useActionState,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
} from "react";
import { updateProfile } from "@/app/dashboard/profile/actions";
import type { ProfileWithRole } from "@/lib/data/profile";
import {
  PROFILE_LIMITS,
  USERNAME_HTML_PATTERN,
  type ProfileField,
  type ProfileFormState,
  type ProfileValues,
} from "@/lib/profile";

const initialState: ProfileFormState = { status: "idle", message: "" };

const inputClass =
  "mt-2 w-full rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400";

export function ProfileForm({
  profile,
  email,
}: {
  profile: ProfileWithRole;
  email: string;
}) {
  const [state, formAction, pending] = useActionState(
    updateProfile,
    initialState,
  );
  const [values, setValues] = useState<ProfileValues>({
    username: profile.username ?? "",
    firstName: profile.first_name ?? "",
    lastName: profile.last_name ?? "",
    street: profile.street ?? "",
    postalCode: profile.postal_code ?? "",
    city: profile.city ?? "",
    countryCode: profile.country_code ?? "",
  });

  function bind(field: ProfileField) {
    return {
      value: values[field],
      onChange(event: ChangeEvent<HTMLInputElement>) {
        setValues((current) => ({
          ...current,
          [field]: event.target.value,
        }));
      },
    };
  }

  return (
    <form action={formAction} className="mt-8 space-y-8">
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Account</h2>
            <p className="mt-1 text-sm text-slate-400">
              Your email is managed by Supabase Authentication.
            </p>
          </div>
          <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-sm font-semibold capitalize text-emerald-300">
            {profile.role}
          </span>
        </div>

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <TextField
            label="Email"
            name="email"
            defaultValue={email}
            disabled
          />
          <TextField
            label="Username"
            name="username"
            {...bind("username")}
            error={state.errors?.username}
            maxLength={PROFILE_LIMITS.username}
            pattern={USERNAME_HTML_PATTERN}
            required
          />
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <h2 className="text-xl font-semibold">Personal details</h2>
        <p className="mt-1 text-sm text-slate-400">
          Only add information you want to keep with this account.
        </p>
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <TextField
            label="First name"
            name="firstName"
            {...bind("firstName")}
            error={state.errors?.firstName}
            maxLength={PROFILE_LIMITS.firstName}
            autoComplete="given-name"
          />
          <TextField
            label="Last name"
            name="lastName"
            {...bind("lastName")}
            error={state.errors?.lastName}
            maxLength={PROFILE_LIMITS.lastName}
            autoComplete="family-name"
          />
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <h2 className="text-xl font-semibold">Address</h2>
        <p className="mt-1 text-sm text-slate-400">
          Address details are optional.
        </p>
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <TextField
              label="Street and house number"
              name="street"
              {...bind("street")}
              error={state.errors?.street}
              maxLength={PROFILE_LIMITS.street}
              autoComplete="street-address"
            />
          </div>
          <TextField
            label="Postal code"
            name="postalCode"
            {...bind("postalCode")}
            error={state.errors?.postalCode}
            maxLength={PROFILE_LIMITS.postalCode}
            autoComplete="postal-code"
          />
          <TextField
            label="City"
            name="city"
            {...bind("city")}
            error={state.errors?.city}
            maxLength={PROFILE_LIMITS.city}
            autoComplete="address-level2"
          />
          <TextField
            label="Country code"
            name="countryCode"
            {...bind("countryCode")}
            error={state.errors?.countryCode}
            maxLength={2}
            pattern="[A-Za-z]{2}"
            placeholder="DE"
            autoComplete="country"
          />
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-emerald-400 px-5 py-2.5 font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save profile"}
        </button>
        {state.message ? (
          <p
            role={state.status === "error" ? "alert" : "status"}
            aria-live="polite"
            className={
              state.status === "error" ? "text-red-300" : "text-emerald-300"
            }
          >
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}

function TextField({
  label,
  name,
  error,
  ...props
}: {
  label: string;
  name: string;
  error?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  const errorId = `${name}-error`;

  return (
    <label className="block text-sm font-medium text-slate-300">
      {label}
      <input
        {...props}
        id={name}
        name={name}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        className={`${inputClass} disabled:cursor-not-allowed disabled:bg-slate-950 disabled:text-slate-500`}
      />
      {error ? (
        <span id={errorId} className="mt-1 block text-sm text-red-300">
          {error}
        </span>
      ) : null}
    </label>
  );
}
