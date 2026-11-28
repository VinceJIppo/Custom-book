# StoryStar brand guidelines (Direction 1: Star ceiling)

This file is written for a coding agent updating the StoryStar website. Follow it for every visual or copy change.

**Sources of truth, in order:**
1. `tokens/tokens.css` and `tokens/tokens.json`: exact colors, type, spacing, radius and shadows. Never hard-code a hex value that has a token.
2. This file: the rules for using them.
3. `reference/homepage.html` and `reference/screenshots/`: the approved homepage, built with `components/storystar.css`. When this file and the reference disagree, this file wins.

---

## 1. The brand in one minute

StoryStar makes hardcover picture books starring a real child, built from one photo. It should feel like an heirloom gift and a nursery full of stars: crisp cream pages, a heritage delft blue, a happy orange-red, ballet pink trim and hand-printed stars overhead.

- **Name:** "StoryStar" in sentences. The logo is the lowercase wordmark "storystar" with a star; it is an image, never live text.
- **Tagline:** "Picture books where your child is the star."
- **Hero line:** "Every child is the star".
- **Capital first letter.** Every headline, display line and heading starts with a capital letter: never all lowercase (the owner's rule; it overrides the lowercase lines in the reference files).
- **No commas in titles.** Page titles, headings, section and card titles, and book titles never contain a comma (the owner's rule; it overrides any older example in the reference files).
- **Mood references:** Weezie (approachable luxury, contrast piping, scallops, monograms), Sister Parish's Serendipity print (a happy star print overhead), Riley Sheehey (watercolor storybook art, delft tiles, ribbons). These are mood only: never copy their art, patterns, products or marks.

## 2. Voice and copy

Write to the grown-up who is buying, about the child who is starring. Warm, a little wry, never saccharine.

- The child is the subject: "Hazel packs a picnic for the moon", not "our AI creates a personalized adventure".
- Say "your star" or the child's name. Avoid "your little one", "kiddo", "mini me".
- Everything is sentence case, including display headlines and buttons: the first letter is always a capital.
- Buttons: verb first, three words or fewer ("Make their book", "Start a book", "Choose this story").
- One exclamation mark per page at most.
- Be plain about how a book is made: "your child appears on every page", "illustrated from your photo". Never imply a human artist hand-painted each book.
- Words we use: story world, starring, dedication, keepsake, bedtime, hardcover, tied with a ribbon.
- Words we avoid: content, avatar, generate, AI-powered, unlock, magic.
- **Never invent facts.** Prices, shipping times, page counts, ages, reviews, press logos and stats come from the business. Until then, keep a bracketed placeholder like `[YOUR PRICE]` and list it in your summary.

## 3. Logo

Files in `assets/logos/`:

| File | Use |
| --- | --- |
| `storystar-wordmark-cream.svg` | On `--ceiling` (header and footer) in both themes, and on photos |
| `storystar-wordmark.svg` | Delft version, on cream or white grounds |
| `storystar-mark.svg` | The star alone: favicon, app icon, social avatar |
| `storystar-monogram.svg` | Scalloped "S" seal: packaging, gift cards, the dedication card |

- Header logo height: 42px desktop, 32px phone. Footer: 44px.
- Clear space: at least the height of the "s" on every side. Minimum width 96px.
- Never recolor parts of it, stretch it, add effects or retype it in a font.
- `alt="storystar"` on the image; wrap it in a link to `/` with `aria-label="StoryStar home"`.

## 4. Color

Two themes share one set of names. **Daytime** is the default. **Bedtime** turns the page into a night sky: set `data-theme="bedtime"` on `<html>`.

| Token | Daytime | Bedtime | Use |
| --- | --- | --- | --- |
| `--paper` | `#fbf6ec` | `#131b37` | Page background. Warm cream by day, night sky navy at bedtime. |
| `--paper-raised` | `#fffdf8` | `#1c2650` | Cards, book pages, modals, the order summary. One step lifted from paper. |
| `--paper-sunk` | `#f3ecdd` | `#0e1530` | Wells: the photo upload zone, the footer, quiet panels inside a raised card. |
| `--ink` | `#1e2a4f` | `#f6efe2` | All body and heading text. Legible on paper, paper-raised, paper-sunk and every -wash fill in both themes (11:1 or better). |
| `--ink-muted` | `#5b6385` | `#b7bdd6` | Secondary text: captions, helper text, page counts. 5:1 or better on paper, paper-raised and paper-sunk in both themes. |
| `--line` | `#e4dac6` | `#2e3a6b` | Hairline dividers and resting card outlines. Decorative only; a control's border uses ink-muted or delft. |
| `--delft` | `#2e4c9e` | `#9db4f0` | The brand blue, from delft tiles and heritage print rooms. Links, the star ceiling band, selected states, the wordmark. |
| `--delft-wash` | `#dfe7f6` | `#24336b` | Soft blue fill behind selected chips and info notes. Text on it is ink or delft. |
| `--on-delft` | `#fffdf8` | `#131b37` | Text and icons on a delft fill (7.8:1 day, 8.2:1 bedtime). |
| `--persimmon` | `#c03f27` | `#f08a68` | The happy orange-red of a hand-printed star. The one primary action per view (Make their book), sale and new markers. |
| `--persimmon-wash` | `#fbe1d6` | `#4a2a35` | Soft fill for promo strips and the New ribbon. Text on it is ink, never persimmon. |
| `--on-persimmon` | `#fffdf8` | `#131b37` | Text on a persimmon fill (5.2:1 day, 6.9:1 bedtime). |
| `--ballet` | `#f3c6cd` | `#e7a9b5` | Ballet pink piping, scallop edges and dedication cards. Decorative trim; text on it is on-accent. |
| `--ballet-deep` | `#a8425e` | `#f2b3c2` | The child's name in script, monogram thread, small pink text on paper or paper-raised (5.4:1 day). |
| `--buttercup` | `#f2c64b` | `#f5d267` | Star yellow. Stars on the delft ceiling, the rating star, the twinkle in the wordmark. |
| `--sage` | `#7fa07c` | `#a9c8a5` | Garden green from storybook illustration. Success fills (Book saved) and illustration accents. |
| `--on-accent` | `#16204a` | `#16204a` | Text on ballet, buttercup and sage fills in both themes (5.4:1 on sage, 8:1 or better on the rest). |
| `--ceiling` | `#2e4c9e` (= delft) | `#24336b` (= delft-wash) | The star ceiling band, the site header and the footer. Delft by day, a deep twilight blue at bedtime so buttercup stars still glow and the scallop hem still shows against the night paper. |
| `--on-ceiling` | `#fffdf8` (= on-delft) | `#f6efe2` (= ink) | Text and the cream wordmark on the ceiling (7.8:1 day, 10.4:1 bedtime). |
| `--focus-ring` | `#2e4c9e` (= delft) | `#9db4f0` (= delft) | Keyboard focus: a 2px paper gap, then a 2px delft ring. 7:1 against paper in both themes. |

Rules:
- Pages are `--paper` (cream), never pure white. Cards and book pages are `--paper-raised`. Wells and the "Peek inside" band are `--paper-sunk`.
- `--delft` carries the brand: links, selected states, frames. The header, star band and footer use `--ceiling` (delft by day, twilight blue at bedtime).
- `--persimmon` is the ONE primary action per view (Make their book, Start a book). Everything else is secondary or a link.
- `--ballet` is trim only: piping, scallop hems, ribbons, the gift band. Never body text.
- `--buttercup` is for stars, never text.
- Text on `--ballet`, `--buttercup` or `--sage` fills is `--on-accent`. Text on persimmon is `--on-persimmon`; on delft, `--on-delft`; on the ceiling, `--on-ceiling`.
- Rough proportion: 60% cream, 20% delft and ceiling, 10% ink, 10% accents.
- **Book covers are product art** and keep fixed colors in both themes. Approved cover grounds: delft `#2e4c9e`, navy `#1e2a4f`, sage `#7fa07c`, persimmon `#c03f27`, each with ballet `#f3c6cd` piping and the child's name in buttercup `#f2c64b`, ballet or cream.

## 5. Themes

- Default: Daytime. Switch to Bedtime automatically from 7pm to 6am local time unless the reader has chosen.
- The header has a 44px round moon button (sun icon when in Bedtime). Clicking it flips the theme and saves the choice (`localStorage` key `ss-theme`, wrapped in try/catch).
- Set the theme on `<html>` before first paint (inline script in `<head>`, or server-side) to avoid a flash.
- `?theme=bedtime` in the URL forces a theme for previews.
- The reference implementation is the `<script>` at the end of `reference/homepage.html`.

## 6. Typography

Three families, each with one job. Self-host the files in `assets/fonts/` (SIL Open Font License, see `LICENSES-OFL.txt`); `tokens.css` holds the `@font-face` rules.

| Family | Token | Job |
| --- | --- | --- |
| Young Serif (400 only) | `--font-display` | Headings, book titles, step titles, story text |
| Figtree (variable 300 to 900) | `--font-sans` | Body, nav, buttons, forms, prices |
| Sacramento (400) | `--font-script` | The child's name and dedication sign-offs only |

| Class | Family | Size / line | Weight | Use |
| --- | --- | --- | --- | --- |
| `.display-xl` | display | 64px / 68px, tracking -0.01em | 400 | Home hero only. Sentence case. |
| `.display-l` | display | 44px / 50px, tracking -0.005em | 400 | Section openers and the book title on a cover mockup. |
| `.heading` | display | 30px / 36px | 400 | Page and panel headings. |
| `.title` | display | 22px / 28px | 400 | Book card titles, step titles. |
| `.story` | display | 20px / 32px | 400 | Story text on book page previews. Max 60 characters a line. |
| `.body` | sans | 17px / 26px | 400 | Default paragraph text. |
| `.body-s` | sans | 15px / 22px | 400 | Card details, helper text, captions. |
| `.label` | sans | 15px / 20px | 600 | Buttons, form labels, nav links. |
| `.eyebrow` | sans | 12px / 16px, tracking 0.14em | 700 | Small caps-style kicker above a heading. Uppercase, tracked. |
| `.monogram` | script | 48px / 52px | 400 | The child's name on covers and dedication cards, like an embroidered monogram. 28px minimum; never for sentences. |
| `.signature` | script | 30px / 34px | 400 | Dedication sign-offs and gift notes. |

Rules:
- Young Serif has one weight: build hierarchy with size and space, never faux bold. Headings use `font-weight: 400`.
- Script: names and sign-offs only, never sentences, never all caps, never under 28px. Always repeat the name in plain text or alt text nearby.
- Eyebrows: 13px Figtree 700, uppercase, `letter-spacing: .14em`, in `--persimmon` (in `--on-accent` on the ballet band).
- Story text lines stay under 60 characters.
- Page headings on the homepage: H1 72/76px (46/50px on phones), H2 44/50px (32/38px on phones), H3 24/30px.

## 7. Spacing, radius, shadow

| Spacing | Value | Use |
| --- | --- | --- |
| `--space-1` | `4px` | Icon to label gap, the piping inset gap. |
| `--space-2` | `8px` | Chip padding, tight stacks. |
| `--space-3` | `12px` | Gap between related controls. |
| `--space-4` | `16px` | Card padding on mobile, form field gap. |
| `--space-6` | `24px` | Card padding on desktop, gutter between cards. |
| `--space-8` | `32px` | Between a heading and its content block. |
| `--space-12` | `48px` | Between sections inside a page. |
| `--space-16` | `64px` | Section padding top and bottom; the star ceiling band height on mobile. |

| Radius | Value | Use |
| --- | --- | --- |
| `--radius-book` | `4px` | Book covers and page previews: square like a real hardcover, softened a touch. |
| `--radius-sm` | `8px` | Inputs, small tags. |
| `--radius-md` | `16px` | Cards, the photo frame, modals. |
| `--radius-pill` | `999px` | Buttons and story-world chips. |

| Shadow | Value | Use |
| --- | --- | --- |
| `--shadow-lift` | daytime: `0 1px 0 rgba(30,42,79,0.06), 0 10px 28px rgba(30,42,79,0.10)`<br>bedtime: `0 1px 0 rgba(0,0,0,0.30), 0 10px 28px rgba(0,0,0,0.40)` | Raised cards and book mockups on hover. Soft, like paper lifting off a table. |
| `--shadow-book` | daytime: `inset 6px 0 0 rgba(30,42,79,0.10), 0 2px 0 rgba(30,42,79,0.08), 0 14px 30px rgba(30,42,79,0.16)`<br>bedtime: `inset 6px 0 0 rgba(0,0,0,0.25), 0 2px 0 rgba(0,0,0,0.35), 0 14px 30px rgba(0,0,0,0.45)` | Book cover mockups only: a spine shadow on the left plus a resting shadow. |

- Content width: 1200px max with 32px side gutters (20px on phones).
- Section padding: 88px top and bottom (52 to 56px on phones). Hero: 72px top, 88px bottom.
- Card padding 16px; gaps between cards 24px (16px on phones).
- Weezie-level white space is part of the luxury. Do not fill it.

## 8. Signature details

Use two or three per view. All six on one screen is too much. CSS for each is in `components/storystar.css`.

1. **Contrast piping.** A 1.5px `--ballet` line set 4 to 7px inside an edge. Recipe: `box-shadow: inset 0 0 0 6px <fill>, inset 0 0 0 7.5px var(--ballet);` Used on primary and secondary buttons, book cards and covers.
2. **The hand-printed star.** One SVG symbol, pasted once per page, drawn with `<use>`:
   ```html
   <svg width="0" height="0" style="position:absolute" aria-hidden="true"><symbol id="ss-s" viewBox="-12.5 -12.5 25 25"><path d="M0.06,-10.12 L3.19,-4.30 L9.77,-3.06 L4.71,1.53 L6.11,8.47 L0.05,5.41 L-5.81,8.10 L-4.97,1.60 L-9.07,-2.88 L-2.95,-4.15Z"/></symbol></svg>
   <svg class="ss-star" viewBox="0 0 25 25" aria-hidden="true"><use href="#ss-s" width="25" height="25"/></svg>
   ```
   In React, make a `<Star />` component that renders the second line, and put the symbol once in the root layout.
3. **Star ceiling.** A 100px band (72px on phones) under the header bar: about 16 stars and 15 dots spread by percentage across the width, mixed buttercup, `--on-ceiling` and the odd ballet star, sizes 12 to 24px, rotated -24 to 30 degrees. Stars live overhead and in the top half of covers; never behind body copy. Exact positions are in `reference/homepage.html`.
4. **Scallop hem.** Half-rounds 32px wide and 16px deep hanging below a colored band: `.ss-scallop-hem` (downward) and `.ss-scallop-top` (upward, on the footer). Set `--hem` to the band color. Leave 16px of margin for the hem. At most three per page: header, gift band, footer.
5. **Delft tile frame.** 2px `--delft` border with quarter-round corner motifs, around the child's photo (`.ss-frame`).
6. **Ticking stripe.** A 24px heritage stripe in `--delft` at the bottom of the "How it works" band (`.ss-ticking`). Never behind text.
7. **Ribbons.** Status tags cut like a ribbon end (`.ss-ribbon`): New story (persimmon wash with a star), Most loved (buttercup), Gift ready (ballet), Saved (sage). One per card.

## 9. Components

All markup examples are in `reference/homepage.html`. Class reference:

| Component | Classes | Notes |
| --- | --- | --- |
| Button | `ss-btn` + `--primary` / `--secondary` / `--sm` / `--block` | Pill, 52px (44px small). Primary is persimmon, once per view. Secondary is cream with a delft outline and pink inner piping. Text links use `ss-link` (wavy underline on hover). |
| Icon button | `ss-iconbtn` (+ `--bare`) | 44px circle, used for the theme toggle and phone menu |
| Ribbon | `ss-ribbon` + `--new` / `--best` / `--saved` | |
| Story-world chip | `ss-chip` inside `ss-chips` | `<button aria-pressed>`, single select, star fills persimmon when selected. Scrolls sideways on phones. |
| Text field | `ss-field`, `ss-field__label`, `ss-field__input` | Focus: delft border plus a 2px focus ring with a 3px paper gap |
| Book cover | `ss-cover` (+ `ss-cover--card`) | Set `--cover`, `--cover-fg`, `--cover-name` inline. Stars in `ss-cover__sky` (top half only). "Starring" eyebrow, name in script, title in Young Serif. |
| Book card | `ss-book` | Piped card: cover, title + price row, one detail line, secondary "Choose this story" |
| Photo frame | `ss-frame`, `ss-frame__photo` | Delft tile frame; holds the uploaded photo or the placeholder |
| Header | `ss-header ss-scallop-hem`, `ss-header__bar`, `ss-nav`, `ss-starband` | Logo left, nav right, theme toggle, small primary CTA. Phones: logo, toggle, menu button; nav opens as a panel. |
| Dedication card | `ss-dedication` | Cream card, ballet-deep piping, monogram seal, script "For Hazel," and sign-off |
| FAQ | `ss-faq`, `ss-faq__item` | Hairline above each item, three across on desktop |
| Footer | `ss-footer ss-scallop-top` | Ceiling color, cream wordmark, signup with buttercup button, three link columns |

Icons: a rounded line set at 1.75px stroke in `currentColor` (the moon, sun, menu and bag icons in the reference). The star is the only filled icon.

## 10. Homepage blueprint

Build the homepage in this order. Copy is approved as written; bracketed text is a placeholder.

1. **Header** (`--ceiling`): cream wordmark; nav "Story worlds", "How it works", "Gifts", "Peek inside"; moon toggle; primary "Start a book". Then the star band and a scallop hem.
2. **Hero** (on `--paper`, two columns, stacks on phones):
   - Eyebrow "Personalized picture books"; H1 "Every child is the star"; lede "Upload one photo and your child becomes the hero of a hardcover storybook, the one they will ask for again tonight."
   - Primary "Make their book" (with star icon) and link "See a sample page".
   - Facts row with small persimmon stars: "Hardcover, 32 pages", "From [YOUR PRICE]", "Ships in [X] days".
   - Art: a large cover ("Starring Hazel, The Moon Picnic", New story ribbon) tilted 3 degrees, the photo frame tilted -4 degrees overlapping its lower left, and a few small stars between them.
3. **How it works** (`--paper-raised` band, ticking stripe at the bottom): eyebrow, H2 "From one photo to a book on their nightstand", four steps numbered inside big buttercup stars:
   - "Add a photo": One clear, smiling face in good light. A phone photo is perfect.
   - "Pick a story world": Moon picnics, garden parties, a parade of very polite dinosaurs.
   - "Write a dedication": A few lines for the first page, signed however you like.
   - "Unwrap it together": A hardcover book in a keepsake box, tied with a ribbon.
4. **Story worlds** (`--paper`): eyebrow, H2 "Pick where the story goes", link "See all story worlds", chips (Moon picnic, Under the sea, Garden party, Dinosaur parade, All worlds), four book cards. Wire chips to real filtering if the site has a catalog.
5. **Peek inside** (`--paper-sunk`): copy on the left ("Their own story on every page"), a two-page spread on the right: watercolor art left, story text right with a folio number. Stacks on phones.
6. **Gifts** (`--ballet` band with scallop hem): "Made to be given", H2 "Wrapped in tissue, tied with a ribbon", body, secondary "Shop gifts"; dedication card on the right.
7. **Questions grown-ups ask**: three FAQs (photo tips, photo privacy `[YOUR PHOTO PROMISE]`, shipping `[YOUR SHIPPING WINDOW]`).
8. **Footer** (`--ceiling`, scallop on top): wordmark, tagline, "Bedtime notes in your inbox" signup, columns Shop / Help / About, copyright.

Sample names in mockups (Hazel, Milo, June, Arlo) are placeholders. Use the shopper's child's name wherever the site knows it.

## 11. Imagery

- **Illustration:** watercolor and gouache on cream paper, soft slightly bleeding edges, the feel of an early 1900s picture book (animals with good manners, picnics, gardens, small domestic details). Palette from the tokens. No 3D, glossy cartoon shading, stock emoji or gradient washes.
- **Never** prompt or brief "in the style of" a named living artist. Describe the qualities instead.
- The child must look consistent from page to page.
- **Placeholders:** until real art exists, use the simple flat-shape placeholders from the reference (moon, hill, striped blanket) and label them "Illustration placeholder". Never ship stock photos of children as if they were customers.

## 12. Accessibility (required)

- Body text 4.5:1 or better in both themes; every token note in `tokens.json` lists its approved pairings. Do not put `--ink-muted` on accent fills.
- `--buttercup`, `--ballet` and `--sage` are never text colors.
- Visible focus on every interactive element: `outline: 2px solid var(--focus-ring); outline-offset: 3px`.
- Real elements: `<button>` for actions, `<a href>` for navigation, `<label>` on every input. Chips use `aria-pressed`. Icon-only buttons need `aria-label`. Decorative stars and patterns are `aria-hidden="true"`.
- Touch targets at least 44px.
- Respect `prefers-reduced-motion` (only the small hover lifts move).

## 13. Using the tokens in your stack

- **Plain CSS / any framework:** import `tokens/tokens.css` once globally (fix the `url()` font paths to where you put the fonts), then `components/storystar.css` or port its rules into your components.
- **Tailwind v3:** add `presets: [require('./storystar-brand/tokens/tailwind.preset.js')]`. Classes become `bg-paper`, `text-ink`, `bg-persimmon`, `font-display`, `text-display-l`, `rounded-pill`, `shadow-book`. Still import `tokens.css` for the variables and fonts.
- **Tailwind v4:** import `tokens.css`, then map the variables in an `@theme inline { --color-paper: var(--paper); ... }` block using the same names as the preset.
- **React / CSS-in-JS:** keep values as `var(--token)` strings so theme switching works without re-rendering.

## 14. Updating an existing site: checklist

1. Audit the current site: list its pages, components, global CSS, fonts and hard-coded colors. Don't change routes, data, checkout or business logic.
2. Copy `assets/fonts/` and `assets/logos/` into the site's public/static folder. Import `tokens.css` globally and fix its font paths. Add the favicon (`storystar-mark.svg`).
3. Map old colors to tokens (backgrounds to `--paper`/`--paper-raised`, text to `--ink`/`--ink-muted`, primary buttons to `--persimmon`, links to `--delft`). Remove leftover hex values.
4. Replace the header and footer first (they appear on every page), including the theme toggle and phone menu.
5. Rebuild the homepage from section 10, matching `reference/screenshots/`.
6. Restyle shared components (buttons, inputs, cards) to the classes in section 9, then roll through the remaining pages.
7. Check both themes and phone width (390px) on every page you touched.
8. In your summary, list every placeholder still in brackets and anything you could not match.

**Done means:** no hard-coded colors outside tokens; one primary button per view; both themes readable; nothing overflows at 390px; all bracketed facts listed for the owner.

## 15. Don't

- Don't use pure white pages, gradients, drop-shadowed text or emoji.
- Don't add more fonts, or use the script face for anything but names and sign-offs.
- Don't put stars, ticking or patterns behind body text.
- Don't use more than one persimmon button per view.
- Don't invent prices, reviews, ratings, press or statistics.
- Don't copy artwork or patterns from Weezie, Sister Parish or Riley Sheehey.
