import { NextResponse, type NextRequest } from "next/server";
import { getStorage } from "@/lib/storage";
import { LocalStorage } from "@/lib/storage/local";

/** Serves private files for the local storage driver, only with a valid, unexpired signature. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string[] }> }) {
  const storage = getStorage();
  if (!(storage instanceof LocalStorage)) return new NextResponse("Not found", { status: 404 });
  const key = (await params).key.join("/");
  const url = new URL(req.url);
  let valid = false;
  try {
    valid = storage.verify(key, url.searchParams.get("exp"), url.searchParams.get("sig"));
  } catch {
    valid = false;
  }
  if (!valid) return new NextResponse("Link expired or invalid", { status: 403 });
  const obj = await storage.get(key);
  if (!obj) return new NextResponse("Not found", { status: 404 });
  const dl = url.searchParams.get("dl");
  return new NextResponse(new Uint8Array(obj.data), {
    headers: {
      "Content-Type": obj.meta.contentType,
      ...(dl ? { "Content-Disposition": `attachment; filename="${dl.replace(/[^A-Za-z0-9 ._-]/g, "")}"` } : {}),
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
    },
  });
}
