/**
 * Makes every text box fit, in the browser (flipbook) and in the PDF renderer,
 * so parents never have to shorten words to print:
 *   1. shrink the words a little (down to 76% of the designed size);
 *   2. let boxes with a height cap grow by up to 40%;
 *   3. shrink a little more (down to 64%).
 * Sizes are set as calc(<designed size> * scale), so the result holds at any zoom.
 * Only text that still doesn't fit after all that is reported by preflight.
 *
 * Kept as plain JavaScript source so the PDF renderer can run exactly the same
 * code inside headless Chromium.
 */
export const FIT_TEXT_SOURCE = `
(function fitTextIn(root) {
  var els = root.querySelectorAll(".bk-text, .bk-cover-title h1");
  for (var i = 0; i < els.length; i++) {
    var el = els[i];
    var base = el.getAttribute("data-fs") || el.style.fontSize;
    if (!base) continue;
    el.setAttribute("data-fs", base);
    if (!el.hasAttribute("data-mh")) el.setAttribute("data-mh", el.style.maxHeight || "");
    var mh = el.getAttribute("data-mh");
    el.style.fontSize = base;
    el.style.maxHeight = mh;
    var box = el.tagName === "H1" ? el.parentElement : el;
    var over = function () { return box.scrollHeight > box.clientHeight + 1 || box.scrollWidth > box.clientWidth + 1; };
    if (!over()) { el.removeAttribute("data-fit"); continue; }
    var s = 1;
    while (over() && s > 0.77) { s -= 0.04; el.style.fontSize = "calc(" + base + " * " + s.toFixed(2) + ")"; }
    if (over() && mh) el.style.maxHeight = "calc(" + mh + " * 1.4)";
    while (over() && s > 0.65) { s -= 0.04; el.style.fontSize = "calc(" + base + " * " + s.toFixed(2) + ")"; }
    el.setAttribute("data-fit", s.toFixed(2));
  }
})`;

/** Runs the fit in the current document (client side). */
export function fitTextIn(root: ParentNode) {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  (new Function(`return ${FIT_TEXT_SOURCE.trim()}`)() as (r: ParentNode) => void)(root);
}
