import "server-only";
import { bankErrorDetails } from "@/lib/bank-error";
import { bankWorkflow } from "@/lib/bank-workflow";
import {
  scheduledSyncAuthorized,
  scheduledSyncConfigured,
  syncSlotStart,
} from "@/lib/scheduled-sync";

export const runtime = "nodejs";
export const maxDuration = 60;

const noStore = { "Cache-Control": "no-store" };

// Called by .github/workflows/bank-sync.yml, never by a browser. Each call
// refreshes one user's bank data, so a slow bank cannot push the others past
// the function's time limit; the workflow calls again while users remain.
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!scheduledSyncConfigured(secret))
    return Response.json({ error: "Scheduled sync is not set up." }, { status: 503, headers: noStore });
  if (!scheduledSyncAuthorized(request.headers.get("authorization"), secret))
    return Response.json({ error: "Not allowed." }, { status: 401, headers: noStore });
  try {
    const { status, remaining, error } = await bankWorkflow().scheduledSync(syncSlotStart(new Date()));
    if (status === "failed")
      console.error("Scheduled bank sync failed for one user.", bankErrorDetails(error));
    // No user ids or bank data in the answer: the workflow log is public.
    return Response.json({ status, remaining }, { headers: noStore });
  } catch (error) {
    console.error("Scheduled bank sync failed.", bankErrorDetails(error));
    return Response.json({ error: "Scheduled sync failed." }, { status: 502, headers: noStore });
  }
}
