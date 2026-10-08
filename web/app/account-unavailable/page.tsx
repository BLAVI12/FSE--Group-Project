import { LogoutButton } from "@/components/logout-button";

export default function AccountUnavailable() {
  return <main className="flex min-h-screen items-center justify-center bg-[#fbfcfa] px-6 text-slate-900">
    <section className="max-w-lg rounded-3xl border border-slate-200 bg-white p-8">
      <h1 className="text-2xl font-bold">Account access unavailable</h1>
      <p className="my-4">Your account may be suspended, or access could not be verified. Please contact your project administrator or try again later.</p>
      <LogoutButton className="rounded-full bg-emerald-700 px-5 py-2 text-white" />
    </section>
  </main>;
}
