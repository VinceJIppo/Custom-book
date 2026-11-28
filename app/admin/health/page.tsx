import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/session";
import { isAdminEmail } from "@/lib/admin";
import { getConfig } from "@/lib/config";
import { getStorage } from "@/lib/storage";
import { activeProviderNames } from "@/lib/providers/registry";
import { S3Storage } from "@/lib/storage/s3";
import { moveMisplacedAction } from "./actions";

export const dynamic = "force-dynamic";

type Check = { name: string; ok: boolean; detail: string };

/** Explains a storage error in plain words, with the setting most likely to blame. */
function storageHint(err: string): string {
  if (/InvalidAccessKeyId|Unauthorized|SignatureDoesNotMatch|AccessDenied|403/i.test(err))
    return "R2 refused the keys. Check S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY (no spaces or quotes), and that the R2 token has Object Read & Write on this bucket.";
  if (/NoSuchBucket|404/i.test(err)) return "The bucket wasn't found. Check S3_BUCKET matches the bucket name in Cloudflare exactly, and that S3_ENDPOINT has your account ID.";
  if (/ENOTFOUND|getaddrinfo|EAI_AGAIN/i.test(err)) return "The endpoint address doesn't exist. Check S3_ENDPOINT is https://<ACCOUNT_ID>.r2.cloudflarestorage.com.";
  if (/amazonaws/i.test(err)) return "It tried Amazon instead of Cloudflare: S3_ENDPOINT is missing.";
  return "See the error above.";
}

async function storageChecks(): Promise<Check[]> {
  const c = getConfig();
  const out: Check[] = [{ name: "Storage driver", ok: c.STORAGE_DRIVER === "s3", detail: c.STORAGE_DRIVER === "s3" ? "s3 (Cloudflare R2)" : "local: files live on the server disk and vanish on redeploy. Set STORAGE_DRIVER=s3." }];
  if (c.STORAGE_DRIVER === "s3") {
    const ep = c.S3_ENDPOINT ?? "";
    let epProblem = "";
    if (!ep) epProblem = "Missing. Without it the app talks to Amazon S3, not R2.";
    else if (!/^https:\/\/[a-f0-9]{32}\.(eu\.)?r2\.cloudflarestorage\.com\/?$/i.test(ep))
      epProblem = `Looks unusual: should be exactly https://<32-character account ID>.r2.cloudflarestorage.com with nothing after it (no bucket name, no slash path).`;
    out.push({ name: "S3_ENDPOINT", ok: !epProblem, detail: epProblem || ep.replace(/^(https:\/\/[a-f0-9]{4})[a-f0-9]+/i, "$1…") });
    out.push({ name: "S3_BUCKET", ok: !!c.S3_BUCKET, detail: c.S3_BUCKET ? c.S3_BUCKET : "Missing." });
    out.push({ name: "S3_REGION", ok: !c.S3_REGION || c.S3_REGION === "auto", detail: c.S3_REGION || "(not set, auto is used)" });
    const key = c.S3_ACCESS_KEY_ID ?? "";
    out.push({ name: "S3_ACCESS_KEY_ID", ok: /^[a-f0-9]{32}$/i.test(key), detail: key ? `${key.length} characters${/^[a-f0-9]{32}$/i.test(key) ? "" : " (R2 access key IDs are 32 letters and numbers: did you paste the token value or include a space?)"}` : "Missing." });
    const secret = c.S3_SECRET_ACCESS_KEY ?? "";
    out.push({ name: "S3_SECRET_ACCESS_KEY", ok: /^[a-f0-9]{64}$/i.test(secret), detail: secret ? `${secret.length} characters${/^[a-f0-9]{64}$/i.test(secret) ? "" : " (R2 secrets are 64 letters and numbers)"}` : "Missing." });
  }
  // The real test: save, read back and remove a tiny file.
  const testKey = `health/check-${Date.now()}.txt`;
  try {
    const s = getStorage();
    await s.put(testKey, Buffer.from("ok"), "text/plain");
    const back = await s.get(testKey);
    await s.delete(testKey);
    out.push({ name: "Save, read and delete a test file", ok: back?.data.toString() === "ok", detail: back ? "Worked." : "Saved, but reading it back returned nothing." });
  } catch (err) {
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    out.push({ name: "Save, read and delete a test file", ok: false, detail: `${msg.slice(0, 400)} → ${storageHint(msg)}` });
  }
  return out;
}

/** Admin-only: checks storage (R2) and which AI providers are switched on. */
export default async function AdminHealth({ searchParams }: { searchParams: Promise<{ moved?: string; skipped?: string; error?: string }> }) {
  const me = await requireOnboardedUser();
  if (!isAdminEmail(me.email)) notFound();
  const sp = await searchParams;
  let misplaced: { count: number; more: boolean } | null = null;
  let misplacedError = "";
  try {
    const s = getStorage();
    if (s instanceof S3Storage) misplaced = await s.countMisplaced();
  } catch (err) {
    misplacedError = String(err).slice(0, 300);
  }
  const c = getConfig();
  const p = activeProviderNames();
  const checks: Check[] = [
    ...(await storageChecks()),
    { name: "Photo checker (vision)", ok: p.vision !== "mock", detail: `${p.vision}${p.vision === "mock" ? " (photos aren't really checked)" : ""}` },
    { name: "ANTHROPIC_API_KEY", ok: !!c.ANTHROPIC_API_KEY, detail: c.ANTHROPIC_API_KEY ? "set" : "missing" },
    { name: "GEMINI_API_KEY", ok: !!c.GEMINI_API_KEY, detail: c.GEMINI_API_KEY ? "set" : "missing" },
  ];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="heading">System check</h1>
        <p className="mt-1 text-ink-muted">Secrets are never shown, only whether they look right. Reload the page to run it again.</p>
      </div>
      {sp.moved !== undefined && (
        <p className="ss-note ss-note--success" role="status">
          Moved {sp.moved} file(s) back into place{Number(sp.skipped) > 0 && ` (${sp.skipped} already had a newer copy, so the old one was removed)`}. Pictures made before the endpoint fix should show again.
        </p>
      )}
      {sp.error && (
        <p className="ss-note ss-note--warn break-words" role="alert">
          Moving files didn&apos;t finish: {sp.error}. You can press the button again; it carries on where it stopped.
        </p>
      )}
      {misplaced && misplaced.count > 0 && (
        <section className="ss-card ss-card--piped">
          <h2 className="title">Files saved in the wrong folder</h2>
          <p className="mt-1 text-sm">
            {misplaced.count}
            {misplaced.more && "+"} file(s) were saved while S3_ENDPOINT ended in the bucket name, so the app can&apos;t find them (they show as broken pictures). Moving them puts them back where the app looks. Nothing is redrawn and it costs nothing.
          </p>
          <form action={moveMisplacedAction} className="mt-4">
            <button className="ss-btn ss-btn--primary">Move {misplaced.count}{misplaced.more && "+"} file(s) into place</button>
          </form>
        </section>
      )}
      {misplaced && misplaced.count === 0 && <p className="text-sm text-ink-muted">No files are in the wrong folder.</p>}
      {misplacedError && <p className="ss-note ss-note--warn break-words">Couldn&apos;t look for misplaced files: {misplacedError}</p>}
      <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-md)] border border-line bg-paper-raised">
        {checks.map((ch) => (
          <li key={ch.name} className="flex gap-3 px-4 py-3">
            <span
              role="img"
              className={`mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full text-sm font-bold ${ch.ok ? "bg-sage text-on-accent" : "bg-persimmon text-on-persimmon"}`}
              aria-label={ch.ok ? "ok" : "problem"}
            >
              {ch.ok ? "✓" : "✗"}
            </span>
            <span className="min-w-0">
              <span className="block break-words font-semibold">{ch.name}</span>
              <span className="block break-words text-sm text-ink-muted">{ch.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
