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

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabaseConfigured = isSupabaseConfigured();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [loadingMethod, setLoadingMethod] = useState<"password" | "google" | null>(
    null,
  );
  const callbackError =
    searchParams.get("error") === "oauth_callback_failed"
      ? "Google login could not be completed. Please try again."
      : "";
  const visibleError = errorMessage || callbackError;

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setErrorMessage("");
    setLoadingMethod("password");

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) {
        setErrorMessage("The email or password is incorrect.");
        return;
      }

      router.replace("/dashboard");
      router.refresh();
    } catch {
      setErrorMessage("Login is currently unavailable. Please try again.");
    } finally {
      setLoadingMethod(null);
    }
  }

  async function handleGoogleLogin() {
    setErrorMessage("");
    setLoadingMethod("google");

    try {
      const { error } = await startGoogleOAuth("login");

      if (error) {
        setErrorMessage("Google login is currently unavailable. Please try again.");
        setLoadingMethod(null);
      }
    } catch {
      setErrorMessage("Google login is currently unavailable. Please try again.");
      setLoadingMethod(null);
    }
  }

  return (
    <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-[#fbfcfa] px-6 py-12 text-slate-900">
      <span className="absolute left-[12%] top-[18%] -rotate-12 text-6xl font-bold text-emerald-100" aria-hidden="true">$</span>
      <span className="absolute bottom-[16%] right-[12%] rotate-12 text-5xl font-bold text-amber-200" aria-hidden="true">$</span>
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
          <div className="mb-8">
            <p className="text-sm font-semibold text-emerald-700">
              Good to see you again
            </p>

            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
              Welcome back
            </h1>

            <p className="mt-2 text-slate-600">
              Log in to view your transactions and budget.
            </p>
          </div>

          {!supabaseConfigured && <SupabaseSetupNotice />}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-semibold text-slate-700"
              >
                Email address
              </label>

              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
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
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
                minLength={8}
                placeholder="Enter your password"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-50"
              />
            </div>

            {visibleError && (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
              >
                {visibleError}
              </div>
            )}

            <button
              type="submit"
              disabled={loadingMethod !== null || !supabaseConfigured}
              className="w-full rounded-xl bg-emerald-700 px-4 py-3 font-semibold text-white transition hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingMethod === "password" ? "Logging in..." : "Log in"}
            </button>
          </form>

          <div className="my-6 flex items-center gap-3" aria-hidden="true">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs uppercase tracking-wider text-slate-400">or</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <GoogleAuthButton
            mode="login"
            onClick={handleGoogleLogin}
            disabled={loadingMethod !== null || !supabaseConfigured}
            loading={loadingMethod === "google"}
          />

          <p className="mt-6 text-center text-sm text-slate-600">
            Do not have an account?{" "}
            <Link
              href="/register"
              className="rounded-sm font-semibold text-emerald-800 hover:text-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
            >
              Create one
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
