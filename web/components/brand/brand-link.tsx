import Link from "next/link";

export function PiggyBank({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M10.2 20.4 7 16.7c-.8-.9-.2-2.3 1-2.3h6.4a18 18 0 0 1 9.7-3h5.2l3.1-4.3c.6-.8 1.9-.6 2.1.4l1.1 5.2a14.1 14.1 0 0 1 6.1 8.8l3.3 2.1c.7.4 1 1.2.8 2l-1.1 4.3c-.2.8-.9 1.3-1.7 1.3h-3.8a14 14 0 0 1-8.4 5.8v4.1c0 .9-.7 1.6-1.6 1.6h-4.5c-.9 0-1.6-.7-1.6-1.6v-3.5h-5.7v3.5c0 .9-.7 1.6-1.6 1.6h-4.5c-.9 0-1.6-.7-1.6-1.6v-6.1a14.2 14.2 0 0 1-4.6-10.5c0-2 .4-3.9 1.2-5.7Z"
        fill="currentColor"
        opacity=".18"
      />
      <path
        d="M10.2 20.4 7 16.7c-.8-.9-.2-2.3 1-2.3h6.4a18 18 0 0 1 9.7-3h5.2l3.1-4.3c.6-.8 1.9-.6 2.1.4l1.1 5.2a14.1 14.1 0 0 1 6.1 8.8l3.3 2.1c.7.4 1 1.2.8 2l-1.1 4.3c-.2.8-.9 1.3-1.7 1.3h-3.8a14 14 0 0 1-8.4 5.8v4.1c0 .9-.7 1.6-1.6 1.6h-4.5c-.9 0-1.6-.7-1.6-1.6v-3.5h-5.7v3.5c0 .9-.7 1.6-1.6 1.6h-4.5c-.9 0-1.6-.7-1.6-1.6v-6.1a14.2 14.2 0 0 1-4.6-10.5c0-2 .4-3.9 1.2-5.7Z"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path
        d="M23 11.5 25.5 7m7.3 4.3 2-2.7"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="30" cy="21" r="1.7" fill="currentColor" />
      <path
        d="M17 17.4v4.2M4.8 24.5h4.1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function BrandLink({
  className = "",
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <Link
      href="/"
      className={`inline-flex items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700 ${className}`}
    >
      <span className={`flex items-center justify-center bg-emerald-100 text-emerald-800 ${compact ? "h-8 w-8 rounded-xl" : "h-10 w-10 rounded-2xl"}`}>
        <PiggyBank className={compact ? "h-6 w-6" : "h-7 w-7"} />
      </span>
      <span className={`font-bold tracking-tight text-slate-900 ${compact ? "text-sm" : "text-base sm:text-lg"}`}>
        Student Finance Planner
      </span>
    </Link>
  );
}
