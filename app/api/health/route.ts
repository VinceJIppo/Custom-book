import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Used by the host's health check: the app is up and the database answers. */
export async function GET() {
  try {
    await db.user.count();
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
