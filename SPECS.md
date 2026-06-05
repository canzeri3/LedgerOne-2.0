# SPECS — exact sizes so nothing scales wrong

Read this alongside `colors_and_type.css`. These are the **intended rendered sizes**, pulled straight
from the design CSS and the real asset files. If Claude Code matches these numbers, scale will be
correct. If something "looks off," it's almost always one of the four root causes in
`SCALE_NOTES` at the bottom — check those first.

> Golden rule: **port the prototype CSS verbatim and load the three fonts.** Re-deriving sizes in
> Tailwind by eye is where drift comes from. The numbers below are already in the CSS — keep them.

---

## Fonts (THE #1 cause of scale drift)
The design uses three Google fonts. They MUST be loaded or text reflows and everything looks
mis-scaled (your app currently ships Inter — different metrics).

- **Display / headings:** `Sora` (weights 600, 700)
- **UI / body:** `DM Sans` (weights 400, 500)
- **Mono / data / labels:** `JetBrains Mono` (weights 400, 500)

Load via `next/font/google` and apply to the marketing routes. Base body size is **16px**; do not
change the root (`html`) font-size — many values are px, but a non-16px root will still skew `rem`s.

### Type scale (px / line-height / letter-spacing)
| Token | size | line-height | tracking | where |
|---|---|---|---|---|
| Hero title | **84px** | 1.04 | -0.025em | `.l1-hero-title` |
| Hero subhead | 17px | 1.55 | — | `.l1-hero-sub` |
| Section H2 | **48px** | 1.1 | -0.025em | `.l1-section-head h2` |
| Section body | 17px | 1.55 | — | `.l1-section-head p` |
| Card H3 | 22px | 1.25 | -0.01em | `.l1-feat h3`, `.l1-case h3` |
| Card body | 14.5px | 1.55 | — | `.l1-feat p`, `.l1-case p` |
| Nav link | 14px | — | — | `.l1-nav-link` |
| Button | 14px (lg: 15px) | — | — | `.l1-btn`, `.l1-btn-lg` |
| Tag / eyebrow | 11px | — | 0.08em | `.l1-tag` |
| Mono label | 11px | — | 0.04–0.14em | stat labels, footers |

Responsive overrides exist at ≤720px (H2 → 36px) and a smaller tier (H2 → 30px). Keep those
breakpoints.

---

## Logos & images (exact display sizes)
The image **files** are large (for retina); they are **displayed small via CSS**. Match the CSS
height, keep `width: auto`, and do NOT let `next/image` impose a different box.

| Asset | File (intrinsic) | Rendered size | Rule |
|---|---|---|---|
| Nav logo (`ledgerone-logo.png`) | 1365×425 | **height: 64px**, width auto (→ shrinks to **74px**?? no: see note) | `.l1-nav-brand img { height: 64px }` |
| Nav logo, scrolled state | — | **height: 74px !important** | `.l1-nav.scrolled .l1-nav-brand img` |
| Footer logo | 1365×425 | **height: 22px**, width auto | `.l1-footer-brand img { height: 22px }` |
| Laptop sidebar logo | 1365×425 | **height: 44px**, width auto | `.lp-side-brand img` |
| `ledgerone-icon.png` | 1120×1120 | square mark — size to context | use where a square icon is needed |
| `app-icon.png` | 1024×1024 | favicon / app icon | not a layout image |

> The nav logo is a wide wordmark (≈3.2:1). Always size by **height** with `width:auto` — never set a
> fixed width, or it stretches. If using `next/image`, pass the intrinsic `width={1365} height={425}`
> and control display size with CSS `height` + `width:auto` (or use a plain `<img>` for the logo to
> avoid `next/image` layout boxing — simplest and most faithful here).

---

## Layout & container widths
| Thing | value | rule |
|---|---|---|
| Page content max-width | **1280px**, padding 0 48px | `.l1-wrap` |
| Nav bar height | 116px (78px scrolled) | `.l1-nav-inner` |
| Hero min-height | 1180px | `.l1-hero` |
| Hero inner max-width | 1100px | `.l1-hero-inner` |
| Laptop mockup max-width | 1200px | `.l1-laptop` |
| Section vertical padding | **120px** top/bottom (base) | `.l1-section` |
| Section head max-width | 720px | `.l1-section-head` |

---

## Cards (the pieces most likely to look "too tall/short")
**Feature cards** (`.l1-feat`): padding **28px**, gap 16px, min-height **280px**, icon **40×40**,
radius 2px, hover ring `0 0 0 1px rgba(107,91,239,0.30)`.

**Use-case cards** (`.l1-case`, home): padding **32px**, gap 16px, min-height **320px**, radius 2px,
**`text-decoration: none`** (these are `<a>` links — without this they show purple underlines),
stat row `.l1-case-stat` has **no** border-top (it was removed), padding-top 16px.

**Use-case cards** (`.l1-case-card`, use-cases page): padding similar; stats row `.stats` keeps a
`border-top: 1px solid var(--color-border)`.

Grids: feature grid and `.l1-cases` collapse to 1 column ≤720px. Radii across the whole design are
deliberately **sharp** — `--radius-sm/md/lg: 2px`. Don't round things to 8–12px.

---

## Spacing rhythm (recent hand-tuned values — keep them)
- Use-cases section: `paddingTop: 24`, **`paddingBottom: 40`** (so the `L1Chrome` divider sits just
  under the "All use cases" button).
- `<L1Chrome />` divider placed **between** the use-cases section and the Trust section.
- Trust section (`07 Trust`): **`paddingBottom: 48`** (brings the closing CTA up).
- Footer: padding **36px 0 28px**; column headings margin-bottom **10px**; links line-height **1.7**;
  fine-print row margin-top **28px**, padding-top **20px**.

---

## Section dividers
`L1Chrome` = the thin chrome ribbon used between sections (`.l1-chrome`, height 1px, purple-tinted
gradient + a 6×3px purple pip with glow). Reuse this component for ALL section dividers — don't
substitute a plain 1px border.

---

## SCALE_NOTES — if scale looks wrong, check these four, in order
1. **Fonts not loaded.** Sora / DM Sans / JetBrains Mono missing → fallback metrics → everything
   reflows. Fix first; it resolves ~80% of "scale is off" reports.
2. **Tailwind preflight** overriding the design (image `display:block`, margin resets, default
   font-size, `box-sizing`). Scope the marketing CSS so Tailwind base doesn't win; ensure
   `box-sizing: border-box` and a 16px root inside the marketing layout.
3. **`next/image` resizing logos.** Use the rendered CSS height with `width:auto` (or a plain `<img>`
   for the wordmark). Don't fix a width on a 3.2:1 logo.
4. **Different root font-size / rem base.** Keep `html` at 16px for marketing routes.

### Verify prompt for Claude Code
> Open design-reference/index.html next to my running localhost page at the same window width. Compare
> the nav logo height, hero title size, card padding/min-height, and footer spacing. List every
> mismatch in px and fix them to match the reference. Confirm Sora/DM Sans/JetBrains Mono are actually
> loading (check computed font-family on a heading), and that Tailwind's preflight isn't overriding
> the marketing CSS.
