"use client";

import { deleteCharacterAction } from "@/app/actions";

/** Deletes a character after a confirm prompt. */
export function DeleteCharacterButton({ childId, sheetId, label, confirmText }: { childId: string; sheetId: string; label: string; confirmText: string }) {
  return (
    <form
      action={deleteCharacterAction}
      onSubmit={(e) => {
        if (!window.confirm(confirmText)) e.preventDefault();
      }}
    >
      <input type="hidden" name="childId" value={childId} />
      <input type="hidden" name="sheetId" value={sheetId} />
      <button className="btn btn-danger-outline btn-sm" data-testid="delete-character">
        {label}
      </button>
    </form>
  );
}
