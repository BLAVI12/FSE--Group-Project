"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export function ProfileMenu({
  active = false,
  bankActive = false,
  bankLabel,
  children,
}: {
  active?: boolean;
  bankActive?: boolean;
  bankLabel: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const profileRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!open) return;

    profileRef.current?.focus();
    let focusCheck: number | undefined;

    function handleOutsideInteraction(event: Event) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Tab") {
        // Tabbing into browser chrome has no focusin target in the document.
        // Check after native Tab navigation, without cancelling that navigation.
        if (focusCheck !== undefined) window.cancelAnimationFrame(focusCheck);
        focusCheck = window.requestAnimationFrame(() => {
          if (!document.hasFocus() || !rootRef.current?.contains(document.activeElement)) {
            setOpen(false);
          }
        });
        return;
      }
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }

    // Safari can blur the focused item without focusing the clicked link/button.
    // Wait for an actual outside focus target instead of hiding it before click.
    document.addEventListener("pointerdown", handleOutsideInteraction);
    document.addEventListener("focusin", handleOutsideInteraction);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handleOutsideInteraction);
      document.removeEventListener("focusin", handleOutsideInteraction);
      document.removeEventListener("keydown", handleKeyDown);
      if (focusCheck !== undefined) window.cancelAnimationFrame(focusCheck);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label="Account menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
        className={`flex h-11 w-11 items-center justify-center rounded-full border bg-emerald-50 text-emerald-800 transition hover:bg-emerald-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700 ${
          active || bankActive || open ? "border-emerald-400 ring-2 ring-emerald-100" : "border-emerald-200"
        }`}
      >
        <svg aria-hidden="true" viewBox="0 0 40 40" className="h-9 w-9" fill="none">
          <circle cx="20" cy="14" r="6" fill="currentColor" opacity=".7" />
          <path d="M8 33a12 12 0 0 1 24 0" fill="currentColor" opacity=".45" />
        </svg>
      </button>

      <div
        id={menuId}
        hidden={!open}
        className="absolute right-0 top-full z-50 mt-3 w-60 max-w-[calc(100vw-3rem)] rounded-2xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/10"
      >
        <p className="px-3 pb-2 pt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Your account
        </p>
        <Link
          ref={profileRef}
          href="/dashboard/profile"
          aria-current={active ? "page" : undefined}
          onClick={() => setOpen(false)}
          className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-emerald-700 ${
            active ? "bg-emerald-50 text-emerald-800" : "text-slate-700 hover:bg-emerald-50 hover:text-emerald-800"
          }`}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <circle cx="12" cy="8" r="3.5" />
            <path d="M5 21v-2a7 7 0 0 1 14 0v2" />
          </svg>
          Profile
        </Link>
        <Link
          href="/dashboard/bank"
          aria-current={bankActive ? "page" : undefined}
          onClick={() => setOpen(false)}
          className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-emerald-700 ${
            bankActive ? "bg-emerald-50 text-emerald-800" : "text-slate-700 hover:bg-emerald-50 hover:text-emerald-800"
          }`}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="m3 9 9-6 9 6H3ZM4 21h16M6 12v6m6-6v6m6-6v6" />
          </svg>
          {bankLabel}
        </Link>
        <div className="my-1 border-t border-slate-100" />
        {children}
      </div>
    </div>
  );
}
