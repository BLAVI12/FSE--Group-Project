/** Bounded browser requests. Status checks never contact Tink. */
import type { BankStatus } from "./tink.ts";

export class BankRequestError extends Error {
  readonly status: number;
  constructor(status: number) {
    super("Bank request failed");
    this.name = "BankRequestError";
    this.status = status;
  }
}

export async function requestBank<T>(
  query: string,
  method: "GET" | "POST",
  signal?: AbortSignal,
  fetchFn: typeof fetch = fetch,
  timeoutMs = 25_000,
): Promise<T> {
  const response = await fetchFn(`/api/tink?${query}`, {
    method,
    cache: "no-store",
    signal: AbortSignal.any([
      AbortSignal.timeout(timeoutMs),
      ...(signal ? [signal] : []),
    ]),
  });
  if (!response.ok) throw new BankRequestError(response.status);
  return response.json() as Promise<T>;
}

type PollOptions = {
  fetch?: typeof fetch;
  timeoutMs?: number;
  requestTimeoutMs?: number;
  intervalMs?: number;
  onStatus?: (status: BankStatus) => void;
};

function pause(milliseconds: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}

/** A slow status check does not mean the background import has failed. */
export async function pollBankStatus(
  signal?: AbortSignal,
  options: PollOptions = {},
): Promise<BankStatus> {
  const deadline = AbortSignal.timeout(options.timeoutMs ?? 90_000);
  const combined = AbortSignal.any([deadline, ...(signal ? [signal] : [])]);
  const fetchFn = options.fetch ?? fetch;
  while (true) {
    combined.throwIfAborted();
    let status: BankStatus;
    try {
      status = await requestBank<BankStatus>(
        "action=status", "GET", combined, fetchFn, options.requestTimeoutMs ?? 10_000,
      );
    } catch (error) {
      combined.throwIfAborted();
      // Authentication and malformed requests need user action, not retries.
      if (error instanceof BankRequestError && error.status < 500 && error.status !== 429)
        throw error;
      await pause(options.intervalMs ?? 2_000, combined);
      continue;
    }
    combined.throwIfAborted();
    options.onStatus?.(status);
    if (status.state !== "syncing") return status;
    await pause(options.intervalMs ?? 2_000, combined);
  }
}
