import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { BrandLink, PiggyBank } from "@/components/brand/brand-link";

const features = [
  {
    number: "01",
    title: "Know where it goes",
    description:
      "Keep your transactions together and make sense of your everyday spending.",
    icon: "↗",
  },
  {
    number: "02",
    title: "Make a plan that fits",
    description:
      "Set a monthly budget that works for student life, not the other way around.",
    icon: "◷",
  },
  {
    number: "03",
    title: "Feel good about progress",
    description:
      "See the little wins add up with a clearer picture of your money.",
    icon: "✳",
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
    <main className="min-h-screen overflow-hidden bg-white text-slate-900">
      <header className="relative z-10">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10">
          <BrandLink />
          <HomeNavigation
            isAuthenticated={isAuthenticated}
            userLabel={userLabel}
          />
        </nav>
      </header>

      <section className="relative isolate mx-auto grid max-w-7xl items-center gap-14 px-6 pb-20 pt-12 sm:pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:px-10 lg:pb-28 lg:pt-20">
        <div className="relative z-10 max-w-2xl">
          <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Your money, feeling more manageable
          </p>

          <h1 className="text-5xl font-bold leading-[1.08] tracking-[-0.045em] text-slate-950 sm:text-6xl lg:text-7xl">
            Student life is a lot.
            <span className="mt-2 block text-emerald-700">
              Your money can feel simple.
            </span>
          </h1>

          <p className="mt-7 max-w-xl text-lg leading-8 text-slate-600">
            An easier way to track spending, plan your budget, and feel a little
            more in control of what comes next.
          </p>

          <HomeHeroActions isAuthenticated={isAuthenticated} />
          {!isAuthenticated && (
            <div className="mt-10 flex items-center gap-3 text-sm text-slate-500">
              <div className="flex -space-x-2" aria-hidden="true">
                <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-amber-100 text-xs text-amber-800">$</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-sky-100 text-xs text-sky-800">$</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-rose-100 text-xs text-rose-800">$</span>
              </div>
              <span>Made for the real ups and downs of student life.</span>
            </div>
          )}
        </div>

        <div className="relative mx-auto w-full max-w-xl lg:ml-auto">
          <div className="absolute -inset-8 -z-10 rounded-[3rem] bg-emerald-50 sm:-inset-12" />
          <span className="absolute -left-5 top-10 rotate-[-12deg] text-4xl font-bold text-emerald-300 sm:-left-8 sm:text-5xl" aria-hidden="true">$</span>
          <span className="absolute -right-3 top-5 rotate-12 text-3xl font-bold text-amber-300 sm:-right-7 sm:text-4xl" aria-hidden="true">$</span>
          <span className="absolute -bottom-8 right-10 rotate-[-8deg] text-4xl font-bold text-rose-300" aria-hidden="true">$</span>

          <div className="relative rounded-[2rem] border border-emerald-100/80 bg-white p-5 shadow-[0_28px_80px_-32px_rgba(15,81,59,0.25)] sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-500">Your monthly snapshot</p>
                <p className="mt-2 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
                  €680
                  <span className="ml-2 text-base font-medium text-slate-500">
                    left to enjoy
                  </span>
                </p>
              </div>
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-800">
                <PiggyBank className="h-8 w-8" />
              </span>
            </div>

            <div className="mt-7 flex items-center justify-between text-sm">
              <span className="font-semibold text-slate-700">Monthly budget</span>
              <span className="text-slate-500">€820 of €1,500 spent</span>
            </div>
            <div
              className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100"
              role="progressbar"
              aria-label="Monthly budget spent"
              aria-valuenow={55}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="h-full w-[55%] rounded-full bg-emerald-500" />
            </div>

            <div className="mt-7 grid grid-cols-2 gap-3 sm:gap-4">
              <SummaryCard label="Spent so far" value="€820" detail="This month" color="bg-emerald-50" />
              <SummaryCard label="Top category" value="Housing" detail="€420 total" color="bg-amber-50" />
            </div>

            <div className="mt-5 flex items-center gap-3 rounded-2xl bg-rose-50/80 p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-rose-600">
                <PiggyBank className="h-7 w-7" />
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-800">A little progress counts</p>
                <p className="mt-0.5 text-xs leading-5 text-slate-500">You checked in on your budget this week. Nice work!</p>
              </div>
              <span className="ml-auto text-xl text-rose-400" aria-hidden="true">✳</span>
            </div>
          </div>

          <span className="absolute -bottom-9 left-4 flex h-14 w-14 rotate-[-10deg] items-center justify-center rounded-2xl border-4 border-white bg-amber-100 text-amber-800 shadow-lg sm:-left-8 sm:h-16 sm:w-16" aria-hidden="true">
            <PiggyBank className="h-10 w-10" />
          </span>
        </div>
      </section>

      <section className="border-y border-slate-100 bg-[#fbfcfa]">
        <div className="mx-auto max-w-7xl px-6 py-20 lg:px-10 lg:py-24">
          <div className="max-w-2xl">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-emerald-700">
              Small steps, more confidence
            </p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
              A money routine that works for you.
            </h2>
            <p className="mt-4 max-w-xl leading-7 text-slate-600">
              No lectures, no judgement. Just a few friendly tools to make
              money feel less mysterious.
            </p>
          </div>

          <div className="mt-11 grid gap-5 md:grid-cols-3">
            {features.map((feature, index) => (
              <article
                key={feature.title}
                className="rounded-3xl border border-slate-100 bg-white p-7 shadow-[0_8px_32px_-24px_rgba(15,23,42,0.25)] transition hover:-translate-y-1 hover:shadow-[0_20px_44px_-28px_rgba(15,81,59,0.28)]"
              >
                <div className="flex items-center justify-between">
                  <span className={`flex h-12 w-12 items-center justify-center rounded-2xl text-xl font-bold ${index === 0 ? "bg-emerald-100 text-emerald-800" : index === 1 ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-700"}`}>
                    {feature.icon}
                  </span>
                  <span className="text-sm font-semibold text-slate-300">{feature.number}</span>
                </div>
                <h3 className="mt-7 text-xl font-bold tracking-tight text-slate-900">
                  {feature.title}
                </h3>
                <p className="mt-3 leading-7 text-slate-600">
                  {feature.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-20 lg:px-10 lg:py-24">
        <div className="relative mx-auto max-w-5xl overflow-hidden rounded-[2rem] bg-emerald-800 px-7 py-12 text-center text-white sm:px-12 sm:py-16">
          <span className="absolute -left-2 top-2 rotate-[-15deg] text-6xl font-bold text-emerald-700/70" aria-hidden="true">$</span>
          <span className="absolute -right-2 bottom-0 rotate-12 text-7xl font-bold text-emerald-700/70" aria-hidden="true">$</span>
          <span className="relative mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-emerald-50">
            <PiggyBank className="h-10 w-10" />
          </span>
        <HomeFinalCallToAction isAuthenticated={isAuthenticated} />
        </div>
      </section>

      <footer className="border-t border-slate-100">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-7 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between lg:px-10">
          <BrandLink compact />
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
          className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700"
        >
          I already have an account
        </Link>

        <Link
          href="/register"
          className="rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700"
        >
          Create account
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <span className="hidden text-sm text-slate-500 lg:inline">
        Signed in as <span className="font-medium text-slate-700">{userLabel}</span>
      </span>

      <Link
        href="/dashboard"
        className="rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700"
      >
        Open dashboard
      </Link>

      <LogoutButton className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700" />
    </div>
  );
}

function HomeHeroActions({ isAuthenticated }: { isAuthenticated: boolean }) {
  if (isAuthenticated) {
    return (
      <div className="mt-8">
        <Link
          href="/dashboard"
          className="inline-flex rounded-full bg-emerald-700 px-7 py-3.5 font-semibold text-white transition hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700"
        >
          Open dashboard <span className="ml-2" aria-hidden="true">→</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-9 flex flex-wrap gap-4">
      <Link
        href="/register"
        className="rounded-full bg-emerald-700 px-7 py-3.5 font-semibold text-white transition hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700"
      >
        Start planning
      </Link>

      <Link
        href="/login"
        className="rounded-full px-5 py-3.5 font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700"
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
      <h2 className="relative mt-5 text-3xl font-bold tracking-tight sm:text-4xl">
        {isAuthenticated
          ? "Continue managing your finances."
          : "Ready to make money feel simpler?"}
      </h2>

      <p className="relative mx-auto mt-4 max-w-xl leading-7 text-emerald-50/80">
        {isAuthenticated
          ? "Your accounts, transactions and monthly overview are ready."
          : "Start with where you are. Your next small step is a good one."}
      </p>

      <Link
        href={isAuthenticated ? "/dashboard" : "/register"}
        className="relative mt-8 inline-flex rounded-full bg-white px-7 py-3.5 font-semibold text-emerald-900 shadow-sm transition hover:-translate-y-0.5 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
      >
        {isAuthenticated ? "Open dashboard" : "Create your free account"}
        <span className="ml-2" aria-hidden="true">→</span>
      </Link>
    </>
  );
}

function SummaryCard({
  label,
  value,
  detail,
  color,
}: {
  label: string;
  value: string;
  detail: string;
  color: string;
}) {
  return (
    <div className={`rounded-2xl p-4 ${color}`}>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-slate-900">{value}</p>
      <p className="mt-0.5 text-xs text-slate-500">{detail}</p>
    </div>
  );
}
