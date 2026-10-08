import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const features = [
  {
    title: "Track transactions",
    description:
      "Record and categorise your income and expenses in one secure place.",
  },
  {
    title: "Plan your budget",
    description:
      "Create monthly budgets and see how much money you have remaining.",
  },
  {
    title: "Understand spending",
    description:
      "Explore spending summaries and identify where your money goes.",
  },
];

export default async function HomePage() {
  let isAuthenticated = false;
  let userLabel: string | null = null;

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    isAuthenticated = Boolean(user);
    userLabel = user?.email ?? user?.id ?? null;
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-white/10">
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <Link href="/" className="text-xl font-bold">
            Student Finance Planner
          </Link>

          <HomeNavigation
            isAuthenticated={isAuthenticated}
            userLabel={userLabel}
          />
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl gap-12 px-6 py-24 lg:grid-cols-2 lg:items-center">
        <div>
          <p className="mb-4 inline-block rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-sm text-emerald-300">
            Personal finance made simpler
          </p>

          <h1 className="text-5xl font-bold leading-tight tracking-tight sm:text-6xl">
            Take control of your student finances.
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">
            Track transactions, organise your spending and manage your
            monthly budget from one secure dashboard.
          </p>

          <HomeHeroActions isAuthenticated={isAuthenticated} />
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400">Monthly budget</p>
              <p className="mt-1 text-3xl font-bold">€680 remaining</p>
            </div>

            <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-sm text-emerald-300">
              On track
            </span>
          </div>

          <div className="my-6 h-3 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full w-3/5 rounded-full bg-emerald-400" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <SummaryCard label="Spent" value="€820" />
            <SummaryCard label="Budget" value="€1,500" />
            <SummaryCard label="Top category" value="Housing" />
            <SummaryCard label="Transactions" value="34" />
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-white/[0.03]">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <p className="text-sm font-semibold uppercase tracking-wider text-emerald-300">
            Core features
          </p>

          <h2 className="mt-3 text-3xl font-bold">
            Everything needed for a clear monthly overview
          </h2>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {features.map((feature, index) => (
              <article
                key={feature.title}
                className="rounded-2xl border border-white/10 bg-slate-900 p-6"
              >
                <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-400 font-bold text-slate-950">
                  {index + 1}
                </div>

                <h3 className="text-xl font-semibold">{feature.title}</h3>

                <p className="mt-3 leading-7 text-slate-400">
                  {feature.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-20 text-center">
        <HomeFinalCallToAction isAuthenticated={isAuthenticated} />
      </section>

      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-8 text-sm text-slate-400 sm:flex-row sm:justify-between">
          <p>Student Finance Planner</p>
          <p>Financial Software Engineering Project</p>
        </div>
      </footer>
    </main>
  );
}

function HomeNavigation({
  isAuthenticated,
  userLabel,
}: {
  isAuthenticated: boolean;
  userLabel: string | null;
}) {
  if (!isAuthenticated) {
    return (
      <div className="flex flex-wrap items-center gap-4">
        <Link
          href="/login"
          className="rounded-lg border border-white/20 px-6 py-3 font-semibold transition hover:bg-white/10"
        >
          I already have an account
        </Link>

        <Link
          href="/register"
          className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-300"
        >
          Create account
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <span className="text-sm text-slate-400">
        Signed in as <span className="text-slate-200">{userLabel}</span>
      </span>

      <Link
        href="/dashboard"
        className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
      >
        Open dashboard
      </Link>

      <form action={signOut}>
        <button
          type="submit"
          className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold transition hover:bg-white/10"
        >
          Log out
        </button>
      </form>
    </div>
  );
}

function HomeHeroActions({ isAuthenticated }: { isAuthenticated: boolean }) {
  if (isAuthenticated) {
    return (
      <div className="mt-8">
        <Link
          href="/dashboard"
          className="inline-block rounded-lg bg-emerald-400 px-6 py-3 font-semibold text-slate-950 transition hover:bg-emerald-300"
        >
          Open dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-8 flex flex-wrap gap-4">
      <Link
        href="/register"
        className="rounded-lg bg-emerald-400 px-6 py-3 font-semibold text-slate-950 hover:bg-emerald-300"
      >
        Start planning
      </Link>

      <Link
        href="/login"
        className="rounded-lg border border-white/20 px-6 py-3 font-semibold hover:bg-white/10"
      >
        Log in
      </Link>
    </div>
  );
}

function HomeFinalCallToAction({
  isAuthenticated,
}: {
  isAuthenticated: boolean;
}) {
  return (
    <>
      <h2 className="text-3xl font-bold">
        {isAuthenticated
          ? "Continue managing your finances."
          : "Ready to understand your spending?"}
      </h2>

      <p className="mt-4 text-slate-300">
        {isAuthenticated
          ? "Your accounts, transactions and monthly overview are ready."
          : "Create an account and start planning your monthly finances."}
      </p>

      <Link
        href={isAuthenticated ? "/dashboard" : "/register"}
        className="mt-8 inline-block rounded-lg bg-emerald-400 px-6 py-3 font-semibold text-slate-950 hover:bg-emerald-300"
      >
        {isAuthenticated ? "Open dashboard" : "Create account"}
      </Link>
    </>
  );
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-slate-900 p-4">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}
