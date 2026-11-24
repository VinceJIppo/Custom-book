import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/session";
import { isAdminEmail } from "@/lib/admin";
import { getConfig } from "@/lib/config";
import { getStorage } from "@/lib/storage";
import { activeProviderNames } from "@/lib/providers/registry";

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
export default async function AdminHealth() {
  const me = await requireOnboardedUser();
  if (!isAdminEmail(me.email)) notFound();
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
        <h1 className="font-display text-3xl font-medium">System check</h1>
        <p className="text-[color:var(--muted)]">Secrets are never shown, only whether they look right. Reload the page to run it again.</p>
      </div>
      <ul className="divide-y divide-[color:var(--line)] rounded-xl bg-white ring-1 ring-[color:var(--line)]">
        {checks.map((ch) => (
          <li key={ch.name} className="flex gap-3 px-4 py-3">
            <span className={ch.ok ? "text-emerald-700" : "text-red-700"} aria-label={ch.ok ? "ok" : "problem"}>
              {ch.ok ? "✓" : "✗"}
            </span>
            <span>
              <span className="font-semibold">{ch.name}</span>
              <span className="block break-words text-sm text-[color:var(--muted)]">{ch.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
