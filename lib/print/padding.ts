/**
 * Page-count rules from the print product: minimum, maximum and multiple.
 * Short books are padded with designed pages, never blank ones.
 */
export interface PageCountRules {
  minPages: number;
  maxPages: number;
  multiple: number;
}

export interface PaddingPlan {
  contentPages: number;
  totalPages: number;
  padPages: number;
  problems: string[];
}

export function planPadding(contentPages: number, rules: PageCountRules): PaddingPlan {
  if (!Number.isInteger(contentPages) || contentPages < 0) throw new Error("contentPages must be a non-negative integer");
  if (rules.multiple < 1 || rules.minPages < 1 || rules.maxPages < rules.minPages) throw new Error("Invalid page-count rules");
  const problems: string[] = [];
  let total = Math.max(contentPages, rules.minPages);
  total = Math.ceil(total / rules.multiple) * rules.multiple;
  if (total > rules.maxPages) {
    problems.push(
      `This book has ${contentPages} pages, but the selected product allows at most ${rules.maxPages}. Choose a shorter story length.`,
    );
  }
  return { contentPages, totalPages: total, padPages: total - contentPages, problems };
}

/** The designed filler pages, in order. Activity pages first, then pattern endpapers. */
export function paddingKinds(count: number): Array<"drawYourOwn" | "endpaper"> {
  const kinds: Array<"drawYourOwn" | "endpaper"> = [];
  for (let i = 0; i < count; i++) kinds.push(i === 0 && count >= 2 ? "drawYourOwn" : "endpaper");
  return kinds;
}
