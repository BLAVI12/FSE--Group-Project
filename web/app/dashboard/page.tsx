import Link from "next/link";

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-slate-950 p-8 text-white">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-3xl font-bold">Dashboard</h1>

        <p className="mt-3 text-slate-400">
          You successfully logged in.
        </p>

        <Link
          href="/"
          className="mt-8 inline-block text-emerald-300 hover:text-emerald-200"
        >
          Return home
        </Link>
      </div>
    </main>
  );
}