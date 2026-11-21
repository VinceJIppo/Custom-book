import { NextResponse, type NextRequest } from "next/server";

/**
 * When PUBLIC_BASE_URL is set (e.g. a tunnel so Lulu can download print
 * files), requests arriving on that public host may ONLY fetch signed PDFs or
 * POST signed webhooks (each webhook verifies its own signature).
 * Everything else (the app, photos, page images) answers 404 there, because
 * single-user mode has no sign-in. Requests on APP_URL (your own machine) are
 * untouched.
 */
export function proxy(request: NextRequest) {
  const publicBase = process.env.PUBLIC_BASE_URL;
  if (!publicBase) return NextResponse.next();
  let publicHost: string;
  let appHost: string;
  try {
    publicHost = new URL(publicBase).host;
    appHost = new URL(process.env.APP_URL ?? "http://localhost:3000").host;
  } catch {
    return NextResponse.next();
  }
  if (publicHost === appHost) return NextResponse.next();
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  if (host !== publicHost) return NextResponse.next();
  const { pathname } = request.nextUrl;
  if (request.method === "GET" && pathname.startsWith("/api/files/") && pathname.endsWith(".pdf")) return NextResponse.next();
  if (request.method === "GET" && pathname === "/api/health") return NextResponse.next();
  if (request.method === "POST" && (pathname === "/api/webhooks/payment" || /^\/api\/webhooks\/print\/[a-z0-9-]+$/.test(pathname))) return NextResponse.next();
  return new NextResponse("Not found", { status: 404 });
}
