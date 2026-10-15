"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";

export type SelectMenuOption = {
  value: string;
  label: string;
};

type MenuPosition = {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  maxHeight: number;
};

export function SelectMenu({
  ariaLabel,
  value,
  options,
  onValueChange,
  name,
  disabled = false,
  compact = false,
}: {
  ariaLabel: string;
  value: string;
  options: readonly SelectMenuOption[];
  onValueChange: (value: string) => void;
  name?: string;
  disabled?: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const selectedOption = options[selectedIndex] ?? options[0];

  function showMenu(index = selectedIndex) {
    if (disabled || options.length === 0 || !triggerRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    const availableBelow = window.innerHeight - rect.bottom - 12;
    const availableAbove = rect.top - 12;
    const openAbove = availableBelow < 180 && availableAbove > availableBelow;

    setPosition({
      ...(openAbove
        ? { bottom: window.innerHeight - rect.top + 8 }
        : { top: rect.bottom + 8 }),
      left: Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)),
      width: rect.width,
      maxHeight: Math.max(
        120,
        Math.min(288, openAbove ? availableAbove : availableBelow),
      ),
    });
    setActiveIndex(index);
    setOpen(true);
  }

  function closeMenu({ restoreFocus = false } = {}) {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }

  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    onValueChange(option.value);
    closeMenu({ restoreFocus: true });
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      showMenu(
        event.key === "ArrowDown"
          ? selectedIndex
          : Math.max(0, selectedIndex - 1),
      );
    }
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(options.length - 1, current + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(0, current - 1));
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(options.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(activeIndex);
    } else if (event.key === "Escape" || event.key === "Tab") {
      closeMenu({ restoreFocus: event.key === "Escape" });
    }
  }

  useEffect(() => {
    if (!open) return;

    menuRef.current?.focus();

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (
        !triggerRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        closeMenu();
      }
    }

    function handleViewportChange() {
      closeMenu();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [open]);

  return (
    <>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-controls={open ? listboxId : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled}
        className={`flex w-full items-center justify-between gap-3 border border-slate-200 bg-white text-left text-slate-900 outline-none transition hover:border-emerald-300 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-50 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 ${
          compact
            ? "rounded-lg px-2.5 py-1.5 text-xs"
            : "rounded-xl px-3 py-2.5 text-sm"
        }`}
        onClick={() => (open ? closeMenu() : showMenu())}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="min-w-0 truncate">
          {selectedOption?.label ?? "Select an option"}
        </span>
        <svg
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 text-slate-500 transition ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="none"
        >
          <path
            d="m5 7.5 5 5 5-5"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </svg>
      </button>

      {open && position
        ? createPortal(
            <div
              ref={menuRef}
              id={listboxId}
              role="listbox"
              aria-label={ariaLabel}
              aria-activedescendant={`${listboxId}-option-${activeIndex}`}
              tabIndex={-1}
              className="fixed z-100 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 text-sm text-slate-900 shadow-xl shadow-slate-900/10 outline-none"
              style={position}
              onKeyDown={handleMenuKeyDown}
            >
              {options.map((option, index) => {
                const selected = option.value === value;
                const active = index === activeIndex;

                return (
                  <button
                    key={option.value}
                    id={`${listboxId}-option-${index}`}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                      active
                        ? "bg-emerald-50 text-emerald-950"
                        : "hover:bg-slate-50"
                    }`}
                    onClick={() => choose(index)}
                    onPointerMove={() => setActiveIndex(index)}
                  >
                    <span className="min-w-0 truncate">{option.label}</span>
                    {selected ? (
                      <svg
                        aria-hidden="true"
                        className="h-4 w-4 shrink-0 text-emerald-700"
                        viewBox="0 0 20 20"
                        fill="none"
                      >
                        <path
                          d="m4.5 10 3.3 3.3 7.7-7.6"
                          stroke="currentColor"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                        />
                      </svg>
                    ) : null}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
