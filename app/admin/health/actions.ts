"use server";

import { notFound, redirect } from "next/navigation";
import { requireOnboardedUser } from "@/lib/session";
import { isAdminEmail } from "@/lib/admin";
import { getStorage } from "@/lib/storage";
import { S3Storage } from "@/lib/storage/s3";
import { log } from "@/lib/log";

/** Admin only: moves files saved under the wrong "<bucket>/" folder back into place. */
export async function moveMisplacedAction() {
  const me = await requireOnboardedUser();
  if (!isAdminEmail(me.email)) notFound();
  const s = getStorage();
  if (!(s instanceof S3Storage)) redirect("/admin/health");
  let target: string;
  try {
    const r = await s.moveMisplaced();
    log.info("Moved misplaced storage files", r);
    target = `/admin/health?moved=${r.moved}&skipped=${r.skipped}`;
  } catch (err) {
    log.error("Moving misplaced files failed", { err: String(err) });
    target = `/admin/health?error=${encodeURIComponent(String(err).slice(0, 200))}`;
  }
  redirect(target);
}
