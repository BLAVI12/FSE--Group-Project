"use client";

import Link from "next/link";
import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GoogleAuthButton } from "@/components/auth/google-auth-button";
import { startGoogleOAuth } from "@/lib/auth/google";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

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
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="mb-8 inline-block text-sm text-slate-400 hover:text-white"
        >
          ← Back to home
        </Link>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 shadow-2xl">
          <div className="mb-8">
            <p className="text-sm font-semibold text-emerald-300">
              Student Finance Planner
            </p>

            <h1 className="mt-2 text-3xl font-bold">
              Welcome back
            </h1>

            <p className="mt-2 text-slate-400">
              Log in to view your transactions and budget.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-medium"
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
                className="w-full rounded-lg border border-white/10 bg-slate-900 px-4 py-3 outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-2 block text-sm font-medium"
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
                className="w-full rounded-lg border border-white/10 bg-slate-900 px-4 py-3 outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
              />
            </div>

            {visibleError && (
              <div
                role="alert"
                className="rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-300"
              >
                {visibleError}
              </div>
            )}

            <button
              type="submit"
              disabled={loadingMethod !== null}
              className="w-full rounded-lg bg-emerald-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingMethod === "password" ? "Logging in..." : "Log in"}
            </button>
          </form>

          <div className="my-6 flex items-center gap-3" aria-hidden="true">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-xs uppercase tracking-wider text-slate-500">or</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          <GoogleAuthButton
            mode="login"
            onClick={handleGoogleLogin}
            disabled={loadingMethod !== null}
            loading={loadingMethod === "google"}
          />

          <p className="mt-6 text-center text-sm text-slate-400">
            Do not have an account?{" "}
            <Link
              href="/register"
              className="font-semibold text-emerald-300 hover:text-emerald-200"
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
