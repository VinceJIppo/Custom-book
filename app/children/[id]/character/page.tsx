import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireOnboardedUser } from "@/lib/session";
import { getStorage } from "@/lib/storage";
import { getConfig } from "@/lib/config";
import { MAX_PHOTOS, photoTips } from "@/lib/characters/service";
import { ART_STYLE_LABELS, HOUSE_STYLE, type ArtStyle } from "@/lib/schemas/theme";
import { CharacterBibleSchema } from "@/lib/schemas/story";
import { activeProviderNames } from "@/lib/providers/registry";
import { isAdminEmail } from "@/lib/admin";
import { approveSheetAction, deletePhotoAction, setDeleteOriginalsAction } from "@/app/actions";
import { BibleForm, PhotoUpload, StartSheetForm } from "@/components/CharacterForms";
import { AutoRefresh } from "@/components/AutoRefresh";
import { DeleteCharacterButton } from "@/components/DeleteCharacterButton";

export const dynamic = "force-dynamic";

/** A small delft tile frame for uploaded photos: delft border with quarter-round corner motifs (after .ss-frame). */
const tileFrame: CSSProperties = {
  background: ["0 0", "100% 0", "0 100%", "100% 100%"].map((at) => `radial-gradient(circle at ${at}, var(--delft) 0 9px, transparent 10px)`).join(", ") + ", var(--paper-raised)",
};

function Img({ src, alt, className }: { src: string; alt: string; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} />;
}

export default async function CharacterPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ approved?: string; deleted?: string; characterDeleted?: string; deleteError?: string; new?: string }> }) {
  const user = await requireOnboardedUser();
  const { id } = await params;
  const sp = await searchParams;
  const child = await db.childProfile.findFirst({
    where: { id, userId: user.id },
    include: { photos: { orderBy: { createdAt: "asc" } }, characterSheets: { orderBy: { createdAt: "desc" } } },
  });
  if (!child) notFound();
  const storage = getStorage();
  const name = child.nickname || child.firstName;
  const grownUp = child.kind === "grownup";
  const cfg = getConfig();
  const providers = activeProviderNames();

  const photos = await Promise.all(child.photos.map(async (p) => ({ ...p, url: await storage.signedUrl(p.storageKey) })));
  const sheets = await Promise.all(
    child.characterSheets
      .filter((s) => s.status !== "rejected" && s.status !== "deleted")
      .map(async (s) => {
        const keys = s.imageKeys as string[];
        const urls = await Promise.all(keys.map((k) => storage.signedUrl(k)));
        const bible = s.bible ? CharacterBibleSchema.safeParse(s.bible) : null;
        return { ...s, urls, bible: bible?.success ? bible.data : null };
      }),
  );
  // Every new book uses the house style; characters in other styles only serve books made earlier.
  const approved = sheets.filter((s) => s.status === "approved" && s.style === HOUSE_STYLE);
  const older = sheets.filter((s) => s.status === "approved" && s.style !== HOUSE_STYLE);
  const drafts = sheets.filter((s) => s.status === "draft" || s.status === "generating" || s.status === "failed").slice(0, 3);
  const busy = sheets.some((s) => s.status === "generating" || (s.status === "approved" && s.bibleStatus === "pending"));
  const rounds: Record<string, number> = {};
  // Deleted characters still count (deleting isn't a way to get more tries).
  // (Sets made before an admin reset the account's character count don't count either.)
  for (const s of child.characterSheets) if (s.status !== "failed" && (!user.characterResetAt || s.createdAt >= user.characterResetAt)) rounds[s.style] = (rounds[s.style] ?? 0) + 1;

  return (
    <div className="space-y-8">
      <AutoRefresh active={busy} />
      <div>
        <Link href={`/children/${child.id}`} className="ss-link body-s inline-flex min-h-11 items-center">
          ← {name}
        </Link>
        {sp.new && <p className="eyebrow mt-2">Step 2 of 2</p>}
        <h1 className="heading mt-1 break-words">{sp.new ? `Photos of ${name}` : `${name}'s character`}</h1>
        <p className="mt-2 text-ink-muted">
          {sp.new
            ? `Add 1 to 3 photos. We start drawing ${name} as soon as they're added, and you pick your favorite. You only do this once: ${name} looks the same in every book.`
            : grownUp
            ? `We turn a few photos of ${name} into an illustrated character, then draw that same character whenever ${name} appears in a child\u2019s book.`
            : "We turn a few photos into an illustrated character, then draw that same character on every page."}
        </p>
        {providers.image === "mock" && isAdminEmail(user.email) && <p className="body-s mt-2 text-ink-muted">Admin only: pictures use placeholder art until a Gemini key is set.</p>}
      </div>

      {sp.characterDeleted && (
        <p className="ss-note ss-note--success" role="status">
          Character deleted. Its pictures have been erased.
        </p>
      )}
      {sp.deleteError && (
        <p className="ss-note ss-note--error" role="alert">
          {sp.deleteError}
        </p>
      )}
      {sp.approved && (
        <p className="ss-note ss-note--success" role="status">
          Character approved!{Number(sp.deleted) > 0 && ` As you asked, the ${sp.deleted} original photo(s) were deleted.`}
        </p>
      )}

      <section className="ss-card ss-card--piped">
        <h2 className="title">1. Photos</h2>
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <div className="min-w-0 space-y-4">
            {photos.length > 0 && (
              <ul className="flex flex-wrap gap-5 pt-2">
                {photos.map((p) => (
                  <li key={p.id} className="relative">
                    <div className="rounded-[var(--radius-md)] border-2 border-delft p-2.5 shadow-lift" style={tileFrame}>
                      <Img src={p.url} alt="Uploaded photo" className="size-24 rounded-[var(--radius-sm)] bg-paper-sunk object-cover" />
                    </div>
                    <form action={deletePhotoAction}>
                      <input type="hidden" name="photoId" value={p.id} />
                      <input type="hidden" name="childId" value={child.id} />
                      <button
                        className="absolute -right-3 -top-3 flex size-9 items-center justify-center rounded-full bg-paper-raised text-xl leading-none text-ink shadow-lift ring-1 ring-line before:absolute before:-inset-1 before:content-[''] hover:bg-persimmon-wash"
                        aria-label="Remove photo"
                      >
                        ×
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <PhotoUpload
              childId={child.id}
              consentGiven={!!child.guardianConsentAt}
              remaining={MAX_PHOTOS - photos.length}
              grownUp={grownUp}
              // Upload is the main action only until there are photos or a character to act on.
              primary={photos.length === 0 && approved.length === 0}
            />
            <form action={setDeleteOriginalsAction} className="body-s flex flex-wrap items-center gap-x-3 gap-y-2">
              <input type="hidden" name="childId" value={child.id} />
              <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-2">
                <input type="checkbox" name="value" defaultChecked={child.deleteOriginalsAfterApproval} className="ss-check shrink-0" />
                <span>Delete the original photos once I approve a character</span>
              </label>
              <button className="ss-btn ss-btn--secondary ss-btn--sm">Save</button>
            </form>
          </div>
          <div className="ss-card ss-card--sunk body-s min-w-0">
            <p className="label">Photo tips</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {photoTips(grownUp).map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-ink-muted">
              Photos are stored encrypted, location data is removed, and they are only used to draw the character, never the book pages.{" "}
              <Link href="/photo-privacy" className="ss-link">
                How we handle photos
              </Link>
            </p>
          </div>
        </div>
      </section>

      <section className="ss-card">
        <h2 className="title">2. Draw the character</h2>
        <div className="mt-4">
          <StartSheetForm
            childId={child.id}
            style={HOUSE_STYLE}
            used={rounds[HOUSE_STYLE] ?? 0}
            maxRounds={cfg.CHARACTER_SHEET_MAX_ROUNDS}
            disabled={photos.length === 0}
            again={drafts.length > 0 || approved.length > 0}
          />
        </div>

        <div className="mt-6 space-y-6">
          {drafts.map((s) => (
            <div key={s.id} data-testid={`sheet-${s.status}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">
                  {ART_STYLE_LABELS[s.style as ArtStyle]} · set {s.round}
                  {s.status === "draft" && <span className="font-normal text-ink-muted"> · pick your favorite</span>}
                </p>
                {s.status === "draft" && (
                  <DeleteCharacterButton childId={child.id} sheetId={s.id} label="Discard these options" confirmText="Discard all three options? Their pictures will be erased. This still counts as one of your tries." />
                )}
              </div>
              {s.status === "generating" && <p className="mt-2 animate-pulse text-ink-muted">Drawing 3 options. This takes about a minute...</p>}
              {s.status === "failed" && <p className="ss-note ss-note--error mt-2">This set didn&apos;t work: {s.error ?? "unknown error"}. It doesn&apos;t count toward the limit; try again.</p>}
              {s.status === "draft" && (
                <div className="mt-3 grid gap-4 sm:grid-cols-3">
                  {s.urls.map((u, i) => (
                    <form key={u} action={approveSheetAction} className="ss-card ss-card--sunk flex flex-col gap-3 p-3">
                      <input type="hidden" name="sheetId" value={s.id} />
                      <input type="hidden" name="childId" value={child.id} />
                      <input type="hidden" name="index" value={i} />
                      <Img src={u} alt={`Character option ${i + 1}`} className="aspect-[3/2] w-full rounded-[var(--radius-sm)] bg-paper-raised object-cover" />
                      <button className="ss-btn ss-btn--secondary ss-btn--sm ss-btn--block" data-testid={`approve-${i}`}>
                        Use option {i + 1}
                      </button>
                    </form>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="ss-card ss-card--piped">
        <h2 className="title break-words">3. {name}&apos;s character</h2>
        {approved.length === 0 && <p className="mt-2 text-ink-muted">None yet. Pick an option above.</p>}
        <div className="mt-4 space-y-8">
          {approved.map((s) => (
            <div key={s.id} className="grid gap-5 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]" data-testid="approved-sheet">
              <div className="min-w-0">
                {s.selectedIndex != null && s.urls[s.selectedIndex] && (
                  <Img src={s.urls[s.selectedIndex]} alt="Approved character" className="w-full rounded-[var(--radius-sm)] bg-paper-sunk ring-1 ring-line" />
                )}
                <p className="mt-2 font-semibold">{ART_STYLE_LABELS[s.style as ArtStyle]}</p>
                <div className="mt-2">
                  <DeleteCharacterButton
                    childId={child.id}
                    sheetId={s.id}
                    label="Delete character"
                    confirmText={`Delete ${name}'s ${ART_STYLE_LABELS[s.style as ArtStyle]} character? Its pictures will be erased. Books already made keep their pictures, but new pictures in those books won't match it. This can't be undone.`}
                  />
                </div>
              </div>
              <div className="min-w-0">
                <p className="ss-pill ss-pill--ready">Ready for every book ✓</p>
                {s.bibleStatus === "pending" && <p className="body-s mt-2 animate-pulse text-ink-muted">Noting the details we keep the same on every page...</p>}
                {s.bibleStatus === "failed" && <p className="ss-note ss-note--warn mt-2">We couldn&apos;t note the details automatically. Please fill them in below.</p>}
                {(s.bible || s.bibleStatus === "failed") && (
                  <details open={s.bibleStatus === "failed"} className="mt-2">
                    <summary className="ss-summary body-s font-semibold text-delft">Fix a detail (hair, glasses, outfit...)</summary>
                    <p className="body-s my-2 text-ink-muted">Every page is drawn with these. Change anything that&apos;s not quite right.</p>
                    <BibleForm
                      childId={child.id}
                      sheetId={s.id}
                      bible={s.bible ?? { hair: "", eyes: "", skinTone: "", faceShape: "", glasses: "none", freckles: "none", signatureOutfit: "", otherDetails: "" }}
                    />
                  </details>
                )}
              </div>
            </div>
          ))}
        </div>
        {older.length > 0 && (
          <details className="mt-6 text-sm">
            <summary className="ss-summary body-s text-ink-muted">Characters in other styles ({older.length}), used only by books made earlier</summary>
            <ul className="mt-2 space-y-1">
              {older.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2">
                  {ART_STYLE_LABELS[s.style as ArtStyle]}
                  <DeleteCharacterButton childId={child.id} sheetId={s.id} label="Delete" confirmText={`Delete ${name}'s ${ART_STYLE_LABELS[s.style as ArtStyle]} character? Books already made keep their pictures.`} />
                </li>
              ))}
            </ul>
          </details>
        )}
        {approved.length > 0 && (
          <Link
            href={grownUp ? "/books/new" : `/books/new?childId=${child.id}`}
            className="ss-btn ss-btn--primary mt-6 h-auto min-h-[52px] max-w-full py-3 text-center"
          >
            {grownUp ? `Add ${name} to a child\u2019s book →` : `Make a book with ${name} →`}
          </Link>
        )}
      </section>
    </div>
  );
}
