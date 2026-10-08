import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return Response.json({ error: "Please sign in again." }, { status: 401 });
  }

  const { id } = await params;
  if (!UUID.test(id)) {
    return Response.json({ error: "Invalid transaction id." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const categoryId =
    typeof body === "object" && body !== null && "categoryId" in body
      ? (body as { categoryId?: unknown }).categoryId
      : undefined;
  if (categoryId !== null && (typeof categoryId !== "string" || !UUID.test(categoryId))) {
    return Response.json({ error: "Invalid category." }, { status: 400 });
  }

  // The security-definer function validates that both the transaction and
  // category belong to this authenticated user (or that the category is global).
  const { error } = await supabase.rpc("set_transaction_category", {
    p_transaction_id: id,
    p_category_id: categoryId,
  });
  if (error) {
    return Response.json({ error: "Category could not be updated." }, { status: 400 });
  }

  return Response.json({ ok: true });
}
