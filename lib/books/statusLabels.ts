/** Book statuses in plain words, and the pill each one wears (BRAND.md: sentence case, never raw codes). */
export const BOOK_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  generating: "Being made",
  story_review: "Story ready to read",
  ready: "Ready to read",
  failed: "Needs attention",
};

export const BOOK_STATUS_PILLS: Record<string, string> = {
  ready: "ss-pill ss-pill--ready",
  story_review: "ss-pill bg-buttercup text-on-accent",
  generating: "ss-pill ss-pill--working",
  failed: "ss-pill ss-pill--attention",
};

export function bookStatusLabel(status: string) {
  return BOOK_STATUS_LABELS[status] ?? status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
}

export function bookStatusPill(status: string) {
  return BOOK_STATUS_PILLS[status] ?? "ss-pill";
}
