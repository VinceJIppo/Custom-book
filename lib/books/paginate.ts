import { isRecto } from "../print/geometry";
import { paddingKinds, planPadding, type PageCountRules, type PaddingPlan } from "../print/padding";
import type { Layout } from "../schemas/story";

export interface LogicalPageRef {
  id: string;
  kind: string;
  layout: Layout;
}

export interface PhysicalPage {
  /** 1-based interior page number. Odd numbers are right-hand (recto) pages. */
  number: number;
  side: "recto" | "verso";
  /** The logical page this physical page shows, or null for padding pages. */
  pageId: string | null;
  layout: Layout;
  /** For spreads: which half of the two-page image this page shows. */
  half?: "left" | "right";
  /** Set when a requested layout could not be honored. */
  degradedFrom?: Layout;
}

export interface Pagination {
  pages: PhysicalPage[];
  padding: PaddingPlan;
  warnings: string[];
}

/**
 * Turns the logical page list into physical interior pages. A spread takes two
 * facing pages and must start on a left-hand (verso) page; if it would start on
 * a right-hand page it is shown as a full-bleed page instead. Then the page count
 * is padded to the product's rules with designed pages at the back.
 */
export function paginate(logical: LogicalPageRef[], rules: PageCountRules): Pagination {
  const pages: PhysicalPage[] = [];
  const warnings: string[] = [];
  for (const lp of logical) {
    const n = pages.length + 1;
    if (lp.layout === "spread") {
      if (!isRecto(n)) {
        pages.push({ number: n, side: "verso", pageId: lp.id, layout: "spread", half: "left" });
        pages.push({ number: n + 1, side: "recto", pageId: lp.id, layout: "spread", half: "right" });
        continue;
      }
      warnings.push(`A two-page spread would start on a right-hand page (page ${n}), so it is shown as a full-page picture.`);
      pages.push({ number: n, side: "recto", pageId: lp.id, layout: "fullBleed", degradedFrom: "spread" });
      continue;
    }
    pages.push({ number: n, side: isRecto(n) ? "recto" : "verso", pageId: lp.id, layout: lp.layout });
  }
  const padding = planPadding(pages.length, rules);
  for (const kind of paddingKinds(padding.padPages)) {
    const n = pages.length + 1;
    pages.push({ number: n, side: isRecto(n) ? "recto" : "verso", pageId: null, layout: kind });
  }
  return { pages, padding, warnings: [...warnings, ...padding.problems] };
}
