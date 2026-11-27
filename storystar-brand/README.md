# StoryStar brand kit (Direction 1: Star ceiling)

Everything Claude Code needs to restyle the StoryStar website to the approved Direction 1 homepage.

```
storystar-brand/
├── BRAND.md                  Brand guidelines, written for a coding agent (start here)
├── CLAUDE-snippet.md         Lines to paste into your project's CLAUDE.md
├── tokens/
│   ├── tokens.css            CSS variables for both themes, @font-face, text style classes
│   ├── tokens.json           The same tokens as data (source of truth)
│   └── tailwind.preset.js    Tailwind v3 preset mapped to the CSS variables
├── components/
│   └── storystar.css         Buttons, chips, ribbons, covers, header, star band, scallops, sections
├── reference/
│   ├── homepage.html         The approved homepage as working HTML + CSS (open it in a browser)
│   └── screenshots/          Desktop daytime, desktop bedtime and phone views
└── assets/
    ├── logos/                Wordmark (delft and cream), star mark, monogram seal (SVG)
    ├── patterns/             Star ceiling, star scatter, ticking and scallop tiles (SVG)
    └── fonts/                Young Serif, Figtree, Sacramento (woff2) + OFL licenses
```

## How to use it with Claude Code

1. Unzip and copy the `storystar-brand` folder into the root of your website's repo.
2. Open your project's `CLAUDE.md` (create one if needed) and paste in the contents of `CLAUDE-snippet.md`.
3. Start Claude Code in the repo and paste this prompt:

> Read storystar-brand/BRAND.md, then look at the images in storystar-brand/reference/screenshots/ and the code in storystar-brand/reference/homepage.html. Audit our current site and tell me your plan before changing anything. Then update the site to match the StoryStar Direction 1 brand in stages: (1) fonts, logos and tokens wired in globally, (2) header and footer with the theme toggle and phone menu, (3) the homepage sections in the order BRAND.md gives, (4) the remaining pages and shared components. Keep all existing routes, data and functionality. Don't invent prices, shipping times, reviews or press; keep bracketed placeholders and list them at the end. Check both themes and a 390px phone width before you finish.

## Preview the reference

Open `reference/homepage.html` in a browser. Add `?theme=bedtime` to the URL to see the Bedtime theme. Narrow the window to see the phone layout.

## Notes

- Bracketed text such as `[YOUR PRICE]`, `[X] days`, `[YOUR PHOTO PROMISE]` and `[YOUR SHIPPING WINDOW]` marks facts only you can supply.
- The picture-book spread uses a simple shape placeholder until real illustrations exist.
- Fonts are licensed under the SIL Open Font License 1.1 and may be self-hosted.
