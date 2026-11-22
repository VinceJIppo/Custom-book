import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { getCredits } from "@/lib/credits";

export const dynamic = "force-dynamic";

/** The signed-in parent's credit balance, for the header. */
export async function GET() {
  const user = await getOptionalUser();
  if (!user) return NextResponse.json({ enabled: false }, { status: 401 });
  const c = await getCredits(user.id);
  return NextResponse.json({ enabled: c.enabled, balanceUsd: c.balanceUsd }, { headers: { "Cache-Control": "no-store" } });
}
