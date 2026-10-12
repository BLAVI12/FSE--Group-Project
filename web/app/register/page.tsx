"use client";

import Link from "next/link";
import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BrandLink } from "@/components/brand/brand-link";
import { GoogleAuthButton } from "@/components/auth/google-auth-button";
import { SupabaseSetupNotice } from "@/components/auth/supabase-setup-notice";
import { startGoogleOAuth } from "@/lib/auth/google";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { registrationNameData } from "@/lib/auth/registration";
import { NAME_INPUT_MAX_LENGTH } from "@/lib/names";

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabaseConfigured = isSupabaseConfigured();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loadingMethod, setLoadingMethod] = useState<
    "password" | "google" | null
  >(null);
  const callbackError =
    searchParams.get("error") === "oauth_callback_failed"
      ? "Google registration could not be completed. Please try again."
      : "";
  const visibleError = errorMessage || callbackError;

  async function handleRegistration(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setErrorMessage("");
    setSuccessMessage("");

    const names = registrationNameData(firstName, lastName);
    if (!names) {
      setErrorMessage("Enter a first and last name, each with at most 100 characters.");
      return;
    }

    if (password.length < 8) {
      setErrorMessage(
        "Password must contain at least 8 characters.",
      );
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("The passwords do not match.");
      return;
    }

    setLoadingMethod("password");

    try {
      const supabase = createClient();

      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: names,
          emailRedirectTo: `${window.location.origin}/login`,
        },
      });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      if (data.session) {
        router.push("/dashboard");
        router.refresh();
        return;
      }

      setSuccessMessage(
        "Account created. Check your email to confirm your account.",
      );
    } catch {
      setErrorMessage("Registration is currently unavailable. Please try again.");
    } finally {
      setLoadingMethod(null);
    }
  }

  async function handleGoogleRegistration() {
    setErrorMessage("");
    setSuccessMessage("");
    setLoadingMethod("google");

    try {
      const { error } = await startGoogleOAuth("register");

      if (error) {
        setErrorMessage(
          "Google registration is currently unavailable. Please try again.",
        );
        setLoadingMethod(null);
      }
    } catch {
      setErrorMessage(
        "Google registration is currently unavailable. Please try again.",
      );
      setLoadingMethod(null);
    }
  }

  return (
    <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-[#fbfcfa] px-6 py-12 text-slate-900">
      <span className="absolute left-[12%] top-[12%] -rotate-12 text-6xl font-bold text-emerald-100" aria-hidden="true">$</span>
      <span className="absolute bottom-[12%] right-[10%] rotate-12 text-5xl font-bold text-amber-200" aria-hidden="true">$</span>
      <div className="relative w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <BrandLink />
        </div>
        <Link
          href="/"
          className="mb-5 inline-block rounded-lg text-sm font-medium text-slate-500 transition hover:text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700"
        >
          ← Back to home
        </Link>

        <div className="rounded-3xl border border-slate-100 bg-white p-7 shadow-[0_24px_70px_-32px_rgba(15,81,59,0.25)] sm:p-9">
          <p className="text-sm font-semibold text-emerald-700">
            A fresh start for your finances
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
            Create your account
          </h1>

          <p className="mt-2 text-slate-600">
            Start managing your student finances.
          </p>

          {!supabaseConfigured && <SupabaseSetupNotice />}

          <form
            onSubmit={handleRegistration}
            className="mt-8 space-y-5"
          >
            <div>
              <label
                htmlFor="firstName"
                className="mb-2 block text-sm font-semibold text-slate-700"
              >
                First name
              </label>

              <input
                id="firstName"
                name="firstName"
                type="text"
                autoComplete="given-name"
                maxLength={NAME_INPUT_MAX_LENGTH}
                value={firstName}
                onChange={(event) =>
                  setFirstName(event.target.value)
                }
                required
                placeholder="Your first name"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-50"
              />
            </div>

            <div>
              <label htmlFor="lastName" className="mb-2 block text-sm font-semibold text-slate-700">
                Last name
              </label>
              <input
                id="lastName"
                name="lastName"
                type="text"
                autoComplete="family-name"
                maxLength={NAME_INPUT_MAX_LENGTH}
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                required
                placeholder="Your last name"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-50"
              />
            </div>

            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-semibold text-slate-700"
              >
                Email
              </label>

              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                placeholder="student@example.com"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-50"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-2 block text-sm font-semibold text-slate-700"
              >
                Password
              </label>

              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) =>
                  setPassword(event.target.value)
                }
                required
                minLength={8}
                placeholder="At least 8 characters"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-50"
              />
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="mb-2 block text-sm font-semibold text-slate-700"
              >
                Confirm password
              </label>

              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(event) =>
                  setConfirmPassword(event.target.value)
                }
                required
                minLength={8}
                placeholder="Enter the password again"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-50"
              />
            </div>

            {visibleError && (
              <p
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
              >
                {visibleError}
              </p>
            )}

            {successMessage && (
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                {successMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={loadingMethod !== null || !supabaseConfigured}
              className="w-full rounded-xl bg-emerald-700 px-4 py-3 font-semibold text-white transition hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingMethod === "password"
                ? "Creating account..."
                : "Create account"}
            </button>
          </form>

          <div className="my-6 flex items-center gap-3" aria-hidden="true">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs uppercase tracking-wider text-slate-400">
              or
            </span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <GoogleAuthButton
            mode="register"
            onClick={handleGoogleRegistration}
            disabled={loadingMethod !== null || !supabaseConfigured}
            loading={loadingMethod === "google"}
          />

          <p className="mt-6 text-center text-sm text-slate-600">
            Already have an account?{" "}
            <Link
              href="/login"
              className="rounded-sm font-semibold text-emerald-800 hover:text-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
            >
              Log in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
