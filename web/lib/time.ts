// The bank and the users are in Germany, while the server runs on UTC. Dates
// and times are therefore shown on the German clock. A fixed time zone also
// makes the server and the browser render the same text.
export const APP_TIME_ZONE = "Europe/Berlin";

/** A moment on the German clock, e.g. "06/10/2026, 14:24:22 CEST". */
export function formatGermanDateTime(value: string | Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: APP_TIME_ZONE,
    timeZoneName: "short",
  }).format(new Date(value));
}
