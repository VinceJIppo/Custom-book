/**
 * Daytime and Bedtime (BRAND.md section 5).
 * - Daytime by default; Bedtime from 7pm to 6am local time unless the reader chose one.
 * - The reader's choice is saved in localStorage "ss-theme".
 * - ?theme=bedtime or ?theme=daytime forces a theme for previews (not saved).
 * The script runs in <head> before first paint, so the page never flashes the wrong theme.
 */
export const THEME_KEY = "ss-theme";

export const THEME_SCRIPT = `(function(){try{var d=document.documentElement,t=null;try{var q=new URLSearchParams(location.search).get("theme");if(q==="bedtime"||q==="daytime")t=q}catch(e){}if(!t){try{t=localStorage.getItem("${THEME_KEY}")}catch(e){}}if(t!=="bedtime"&&t!=="daytime"){var h=new Date().getHours();t=h>=19||h<6?"bedtime":"daytime"}d.setAttribute("data-theme",t)}catch(e){}})();`;

/** The same choice the head script makes, for the browser after load. */
export function preferredTheme(): "bedtime" | "daytime" {
  try {
    const q = new URLSearchParams(location.search).get("theme");
    if (q === "bedtime" || q === "daytime") return q;
  } catch {}
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === "bedtime" || t === "daytime") return t;
  } catch {}
  const h = new Date().getHours();
  return h >= 19 || h < 6 ? "bedtime" : "daytime";
}
