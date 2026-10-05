"use client";

import Link from "next/link";
import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GoogleAuthButton } from "@/components/auth/google-auth-button";
import { startGoogleOAuth } from "@/lib/auth/google";
import { createClient } from "@/lib/supabase/client";

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [displayName, setDisplayName] = useState("");
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
          data: {
            display_name: displayName.trim(),
          },
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
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-12 text-white">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="mb-8 inline-block text-sm text-slate-400 hover:text-white"
        >
          ← Back to home
        </Link>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-8">
          <h1 className="text-3xl font-bold">
            Create your account
          </h1>

          <p className="mt-2 text-slate-400">
            Start managing your student finances.
          </p>

          <form
            onSubmit={handleRegistration}
            className="mt-8 space-y-5"
          >
            <div>
              <label
                htmlFor="displayName"
                className="mb-2 block text-sm font-medium"
              >
                Name
              </label>

              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(event) =>
                  setDisplayName(event.target.value)
                }
                required
                placeholder="Your name"
                className="w-full rounded-lg border border-white/10 bg-slate-900 px-4 py-3 outline-none focus:border-emerald-400"
              />
            </div>

            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-medium"
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
                className="w-full rounded-lg border border-white/10 bg-slate-900 px-4 py-3 outline-none focus:border-emerald-400"
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
                onChange={(event) =>
                  setPassword(event.target.value)
                }
                required
                minLength={8}
                placeholder="At least 8 characters"
                className="w-full rounded-lg border border-white/10 bg-slate-900 px-4 py-3 outline-none focus:border-emerald-400"
              />
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="mb-2 block text-sm font-medium"
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
                className="w-full rounded-lg border border-white/10 bg-slate-900 px-4 py-3 outline-none focus:border-emerald-400"
              />
            </div>

            {visibleError && (
              <p
                role="alert"
                className="rounded-lg bg-red-400/10 p-3 text-sm text-red-300"
              >
                {visibleError}
              </p>
            )}

            {successMessage && (
              <p className="rounded-lg bg-emerald-400/10 p-3 text-sm text-emerald-300">
                {successMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={loadingMethod !== null}
              className="w-full rounded-lg bg-emerald-400 px-4 py-3 font-semibold text-slate-950 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingMethod === "password"
                ? "Creating account..."
                : "Create account"}
            </button>
          </form>

          <div className="my-6 flex items-center gap-3" aria-hidden="true">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-xs uppercase tracking-wider text-slate-500">
              or
            </span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          <GoogleAuthButton
            mode="register"
            onClick={handleGoogleRegistration}
            disabled={loadingMethod !== null}
            loading={loadingMethod === "google"}
          />

          <p className="mt-6 text-center text-sm text-slate-400">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-semibold text-emerald-300"
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
