export default function TransactionsLoading() {
  return (
    <main
      className="min-h-screen bg-slate-950 px-6 py-16 text-white"
      aria-busy="true"
    >
      <div className="mx-auto max-w-6xl">
        <p className="text-sm font-semibold uppercase tracking-wider text-emerald-300">
          Transactions
        </p>
        <h1 className="mt-2 text-3xl font-bold">
          Loading your spending trends…
        </h1>
        <div
          aria-hidden="true"
          className="mt-8 grid animate-pulse gap-4 sm:grid-cols-3"
        >
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-32 rounded-2xl bg-white/5" />
          ))}
        </div>
        <div
          aria-hidden="true"
          className="mt-6 h-80 animate-pulse rounded-2xl bg-white/5"
        />
      </div>
    </main>
  );
}
