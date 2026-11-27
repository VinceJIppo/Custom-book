import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireOnboardedUser } from "@/lib/session";
import { getStorage } from "@/lib/storage";
import { getConfig } from "@/lib/config";
import { MAX_PHOTOS, photoTips, sheetOptionCost } from "@/lib/characters/service";
import { ART_STYLE_LABELS, HOUSE_STYLE, type ArtStyle } from "@/lib/schemas/theme";
import { CharacterBibleSchema } from "@/lib/schemas/story";
import { activeProviderNames } from "@/lib/providers/registry";
import { approveSheetAction, deletePhotoAction, setDeleteOriginalsAction } from "@/app/actions";
import { BibleForm, PhotoUpload, StartSheetForm } from "@/components/CharacterForms";
import { AutoRefresh } from "@/components/AutoRefresh";
import { DeleteCharacterButton } from "@/components/DeleteCharacterButton";

export const dynamic = "force-dynamic";

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
  for (const s of child.characterSheets) if (s.status !== "failed") rounds[s.style] = (rounds[s.style] ?? 0) + 1;

  return (
    <div className="space-y-8">
      <AutoRefresh active={busy} />
      <div>
        <Link href={`/children/${child.id}`} className="text-sm font-semibold text-cobalt">
          ← {name}
        </Link>
        {sp.new && <p className="mt-2 text-sm font-semibold uppercase tracking-wider text-[color:var(--muted)]">Step 2 of 2</p>}
        <h1 className="mt-1 font-display text-3xl font-medium">{sp.new ? `Photos of ${name}` : `${name}'s character`}</h1>
        <p className="mt-1 text-[color:var(--muted)]">
          {sp.new
            ? `Add 1 to 3 photos. We start drawing ${name} as soon as they're added, and you pick your favorite. You only do this once: ${name} looks the same in every book.`
            : grownUp
            ? `We turn a few photos of ${name} into an illustrated character, then draw that same character whenever ${name} appears in a child\u2019s book.`
            : "We turn a few photos into an illustrated character, then draw that same character on every page."}
          {providers.image === "mock" && " Image provider: mock (placeholder art). Add GEMINI_API_KEY to draw real characters."}
        </p>
      </div>

      {sp.characterDeleted && (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-emerald-900 ring-1 ring-emerald-200">Character deleted. Its pictures have been erased.</p>
      )}
      {sp.deleteError && <p className="rounded-xl bg-amber-50 px-4 py-3 text-amber-900 ring-1 ring-amber-200">{sp.deleteError}</p>}
      {sp.approved && (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-emerald-900 ring-1 ring-emerald-200">
          Character approved!{Number(sp.deleted) > 0 && ` As you asked, the ${sp.deleted} original photo(s) were deleted.`}
        </p>
      )}

      <section className="rounded-xl bg-white p-5 ring-1 ring-[color:var(--line)]">
        <h2 className="font-display text-xl font-medium">1. Photos</h2>
        <div className="mt-3 grid gap-5 md:grid-cols-2">
          <div className="space-y-4">
            {photos.length > 0 && (
              <ul className="flex flex-wrap gap-3">
                {photos.map((p) => (
                  <li key={p.id} className="relative">
                    <Img src={p.url} alt="Uploaded photo" className="size-28 rounded-lg object-cover ring-1 ring-black/10" />
                    <form action={deletePhotoAction}>
                      <input type="hidden" name="photoId" value={p.id} />
                      <input type="hidden" name="childId" value={child.id} />
                      <button className="absolute -right-2 -top-2 rounded-full bg-white px-2 text-sm font-bold ring-1 ring-black/10" aria-label="Remove photo">
                        ×
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <PhotoUpload childId={child.id} consentGiven={!!child.guardianConsentAt} remaining={MAX_PHOTOS - photos.length} grownUp={grownUp} />
            <form action={setDeleteOriginalsAction} className="flex items-center gap-2 text-sm">
              <input type="hidden" name="childId" value={child.id} />
              <input type="checkbox" name="value" defaultChecked={child.deleteOriginalsAfterApproval} className="size-4 accent-[color:var(--color-cobalt)]" />
              <span>Delete the original photos once I approve a character</span>
              <button className="btn btn-secondary btn-sm ml-1">Save</button>
            </form>
          </div>
          <div className="rounded-lg bg-cream p-4 text-sm">
            <p className="font-semibold">Photo tips</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {photoTips(grownUp).map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-[color:var(--muted)]">
              Photos are stored encrypted, location data is removed, and they are only used to draw the character, never the book pages.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-xl bg-white p-5 ring-1 ring-[color:var(--line)]">
        <h2 className="font-display text-xl font-medium">2. Draw the character</h2>
        <div className="mt-3">
          <StartSheetForm
            childId={child.id}
            style={HOUSE_STYLE}
            cost={sheetOptionCost()}
            used={rounds[HOUSE_STYLE] ?? 0}
            maxRounds={cfg.CHARACTER_SHEET_MAX_ROUNDS}
            disabled={photos.length === 0}
            again={drafts.length > 0 || approved.length > 0}
          />
          {photos.length === 0 && <p className="mt-2 text-sm text-[color:var(--muted)]">Add a photo first.</p>}
        </div>

        <div className="mt-6 space-y-6">
          {drafts.map((s) => (
            <div key={s.id} data-testid={`sheet-${s.status}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">
                  {ART_STYLE_LABELS[s.style as ArtStyle]} · set {s.round}
                  {s.status === "draft" && <span className="font-normal text-[color:var(--muted)]"> · pick your favorite (cost ${s.costUsd.toFixed(2)})</span>}
                </p>
                {s.status === "draft" && (
                  <DeleteCharacterButton childId={child.id} sheetId={s.id} label="Discard these options" confirmText="Discard all three options? Their pictures will be erased. This still counts as one of your tries." />
                )}
              </div>
              {s.status === "generating" && <p className="mt-2 animate-pulse text-[color:var(--muted)]">Drawing 3 options. This takes about a minute...</p>}
              {s.status === "failed" && <p className="mt-2 text-red-700">This set didn&apos;t work: {s.error ?? "unknown error"}. It doesn&apos;t count toward the limit; try again.</p>}
              {s.status === "draft" && (
                <div className="mt-3 grid gap-4 sm:grid-cols-3">
                  {s.urls.map((u, i) => (
                    <form key={u} action={approveSheetAction} className="overflow-hidden rounded-lg bg-cream ring-1 ring-[color:var(--line)]">
                      <input type="hidden" name="sheetId" value={s.id} />
                      <input type="hidden" name="childId" value={child.id} />
                      <input type="hidden" name="index" value={i} />
                      <Img src={u} alt={`Character option ${i + 1}`} className="aspect-[3/2] w-full object-cover" />
                      <button className="w-full bg-cobalt py-2 font-semibold text-white hover:bg-cobalt-dark" data-testid={`approve-${i}`}>
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

      <section className="rounded-xl bg-white p-5 ring-1 ring-[color:var(--line)]">
        <h2 className="font-display text-xl font-medium">3. {name}&apos;s character</h2>
        {approved.length === 0 && <p className="mt-2 text-[color:var(--muted)]">None yet. Pick an option above.</p>}
        <div className="mt-3 space-y-8">
          {approved.map((s) => (
            <div key={s.id} className="grid gap-5 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]" data-testid="approved-sheet">
              <div>
                {s.selectedIndex != null && s.urls[s.selectedIndex] && <Img src={s.urls[s.selectedIndex]} alt="Approved character" className="w-full rounded-lg ring-1 ring-black/10" />}
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
              <div>
                <p className="font-semibold">Ready for every book ✓</p>
                {s.bibleStatus === "pending" && <p className="animate-pulse text-sm text-[color:var(--muted)]">Noting the details we keep the same on every page...</p>}
                {s.bibleStatus === "failed" && <p className="text-sm text-red-700">We couldn&apos;t note the details automatically. Please fill them in below.</p>}
                {(s.bible || s.bibleStatus === "failed") && (
                  <details open={s.bibleStatus === "failed"} className="mt-2">
                    <summary className="cursor-pointer text-sm font-semibold text-cobalt">Fix a detail (hair, glasses, outfit...)</summary>
                    <p className="my-2 text-sm text-[color:var(--muted)]">Every page is drawn with these. Change anything that&apos;s not quite right.</p>
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
            <summary className="cursor-pointer text-[color:var(--muted)]">Characters in other styles ({older.length}), used only by books made earlier</summary>
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
          <Link href={grownUp ? "/books/new" : `/books/new?childId=${child.id}`} className="btn btn-sky mt-6">
            {grownUp ? `Add ${name} to a child\u2019s book →` : `Make a book with ${name} →`}
          </Link>
        )}
      </section>
    </div>
  );
}
