"use client";

import { startTransition, useActionState } from "react";
import { artAction, layoutAction, reviseTextAction, updateTextAction, type EditState } from "@/app/actions";

const input = "ss-input mt-1";
// "Save text" is the one primary action on the page editor; everything else is secondary.
const btn = "ss-btn ss-btn--primary ss-btn--sm";
const btnAlt = "ss-btn ss-btn--secondary ss-btn--sm";

function keep(action: (fd: FormData) => void) {
  return (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    if (submitter?.name) fd.set(submitter.name, submitter.value);
    startTransition(() => action(fd));
  };
}

function Status({ state }: { state: EditState | null }) {
  if (!state?.message) return null;
  return (
    <p role="status" className={`ss-note py-2 ${state.ok ? "ss-note--success" : "ss-note--error"}`}>
      {state.message}
    </p>
  );
}

function Hidden({ bookId, pageId }: { bookId: string; pageId: string }) {
  return (
    <>
      <input type="hidden" name="bookId" value={bookId} />
      <input type="hidden" name="pageId" value={pageId} />
    </>
  );
}

export function TextEditor({ bookId, pageId, text }: { bookId: string; pageId: string; text: string }) {
  const [saveState, save, saving] = useActionState(updateTextAction, null);
  const [aiState, revise, revising] = useActionState(reviseTextAction, null);
  return (
    <div className="space-y-4">
      <form onSubmit={keep(save)} className="space-y-2" key={text}>
        <Hidden bookId={bookId} pageId={pageId} />
        <label className="title block" htmlFor="page-text">
          Page text
        </label>
        <textarea id="page-text" name="text" defaultValue={text} rows={4} maxLength={900} className={input} data-testid="page-text" />
        <div className="flex flex-wrap items-center gap-3">
          <button disabled={saving} className={btn}>
            {saving ? "Saving..." : "Save text"}
          </button>
          <Status state={saveState} />
        </div>
      </form>
      <form onSubmit={keep(revise)} className="space-y-2">
        <Hidden bookId={bookId} pageId={pageId} />
        <label className="label block" htmlFor="revise">
          Or ask for a rewrite
        </label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input id="revise" name="instruction" maxLength={300} placeholder="make it rhyme, mention Grandma, make it shorter" className="ss-input min-w-0" />
          <button disabled={revising} className={`${btnAlt} shrink-0`}>
            {revising ? "Rewriting..." : "Rewrite"}
          </button>
        </div>
        <Status state={aiState} />
      </form>
    </div>
  );
}

export function ArtEditor({ bookId, pageId, busy, hasImage }: { bookId: string; pageId: string; busy: boolean; hasImage: boolean }) {
  const [state, action, pending] = useActionState(artAction, null);
  return (
    <form onSubmit={keep(action)} className="space-y-2">
      <Hidden bookId={bookId} pageId={pageId} />
      <label className="title block" htmlFor="art-note">
        Change the picture
      </label>
      <input id="art-note" name="note" maxLength={300} placeholder={'"make him smile", "add the dog", "nighttime"'} className={input} data-testid="art-note" />
      <div className="flex flex-wrap items-center gap-2">
        <button name="mode" value="edit" disabled={pending || busy || !hasImage} className={btnAlt} data-testid="art-edit">
          Change this picture
        </button>
        <button name="mode" value="redraw" disabled={pending || busy} className={btnAlt} data-testid="art-redraw">
          Redraw from scratch
        </button>
      </div>
      <p className="text-xs text-ink-muted">Only this page is redrawn. Your current picture is kept in the history.</p>
      <Status state={state} />
    </form>
  );
}

const LAYOUTS: Array<[string, string]> = [
  ["fullBleed", "Full-page picture, text over it"],
  ["imageTop", "Picture on top, text below"],
  ["textSpot", "Text page with a small picture"],
  ["spread", "Two-page spread"],
];

export function LayoutEditor({ bookId, pageId, layout, textZone }: { bookId: string; pageId: string; layout: string; textZone: string }) {
  const [state, action, pending] = useActionState(layoutAction, null);
  return (
    <form onSubmit={keep(action)} className="space-y-2" key={`${layout}-${textZone}`}>
      <Hidden bookId={bookId} pageId={pageId} />
      <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <label className="block">
          <span className="label">Layout</span>
          <select name="layout" defaultValue={layout} className={input} data-testid="layout-select">
            {LAYOUTS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Text position</span>
          <select name="textZone" defaultValue={textZone} className={input}>
            <option value="top">Top</option>
            <option value="bottom">Bottom</option>
            <option value="left">Left</option>
            <option value="right">Right</option>
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className={btnAlt}>
          Apply layout
        </button>
        <Status state={state} />
      </div>
    </form>
  );
}
