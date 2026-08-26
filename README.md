# Clear View Pressure Washing & Auto Detail

Marketing site for **Clear View Pressure Washing & Auto Detail**, Jacksonville FL.
Static, no server runtime, deploys to Cloudflare Pages.

- **Domain:** ClearViewJax.com
- **Phones:** Kellie (904) 312-1236 · AC (904) 309-1289
- **In business since:** 2009

---

## Running it locally

```bash
npm install
npm run serve
```

Then open <http://localhost:4321>.

## Deploying to Cloudflare Pages

The site is plain static files at the repo root, so there is effectively nothing to
configure:

| Setting | Value |
| --- | --- |
| Framework preset | **None** |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node version | 20 or newer |

`npm run build` copies the site into `dist/` and inlines the CSS. If you would
rather skip the build entirely, you can point Pages at the repo root with an empty
build command — `index.html` works as-is.

---

## What the client still needs to supply

Every one of these is marked with a `TODO` comment in the source.

| # | Where | What is needed |
| --- | --- | --- |
| 1 | `index.html` — Before/After section | **Real before & after photos.** The two images currently shown are illustrative, *not* photographs of a Clear View job. Replace `assets/design/raw-08-ba-before.png` and `raw-09-ba-after.png`, then run `npm run assets`. Both shots must be taken from the same spot with the same framing or the wipe will not line up. Update the two `alt` texts. |
| 2 | `index.html` — Testimonials | **Three real customer reviews.** The quotes are clearly-marked placeholders. Replace the text, the name and the neighbourhood, then remove the `quote--placeholder` class. There are deliberately **no star ratings or review counts anywhere on the site** — those may only be added once they come from a real review platform, along with a matching `Review`/`AggregateRating` block in the JSON-LD. |
| 3 | `index.html` — Quote form | **A real form endpoint.** Set `data-endpoint` on `#quote-form` to a form service URL (Formspree, Basin, Web3Forms) or a Cloudflare Pages Function. Until then the form validates properly and then tells the visitor to phone instead — it never silently swallows a lead. |
| 4 | `index.html` — Footer | **Opening hours.** Currently reads "Call for availability" because no hours were supplied. Send them and they go here, plus an `openingHoursSpecification` entry in the JSON-LD. |
| 5 | `index.html` — Auto detailing | **Confirm the detailing services.** The four listed items are deliberately generic. Nothing claims a specific package, price or product brand. |

Nothing on this site invents a review, a rating, a certification, a licence number
or a before/after statistic.

---

## Project layout

```
index.html              the whole site (one page)
assets/
  css/tokens.css        design tokens — colours, type, spacing. Start here.
  css/styles.css        the stylesheet
  js/site.js            nav, before/after slider, scroll reveal, form
  brand/                logo family (SVG)
  fonts/                self-hosted Geist variable subset (29 KB)
  img/                  optimised AVIF + WebP renditions, favicons, OG card
  video/                hero loop, MP4 + WebM, desktop + mobile
  design/               source artwork and masters (not all committed)
scripts/
  optimize-assets.mjs   images, video, favicons, OG card
  trace-logo.mjs        vectorises the client's raster logo
  build-brand.mjs       generates the logo family from the traced mark
  contrast.py           WCAG contrast audit for the palette
  build.mjs             produces dist/ for deployment
  serve.mjs             local static server
```

---

## Design system

**Change colours in one place:** `assets/css/tokens.css`. Nothing else hard-codes a
colour.

### The one palette rule that must not be broken

The brand blue exists at two steps, and which one you use depends on the surface:

| Surface | Token | Why |
| --- | --- | --- |
| **Dark** grounds | `--cv-accent` `#4FA8E8` | 7.01:1 as text on navy. As a button fill, label it with `--cv-accent-ink` (6.01:1). |
| **Light** grounds | `--cv-brand` `#2E6DA4` | The logo's own blue. 5.18:1 as text on paper. As a button fill, label it white (5.47:1). |

Never put `--cv-accent` on a light surface — it scores **2.46:1** there, which fails
even the 3:1 threshold for a UI component. This is the reason there are two steps
rather than one.

Verify the whole palette at any time:

```bash
python scripts/contrast.py
```

All pairs must print `PASS`.

### Typography

One self-hosted variable font (Geist, weights 300–800, latin subset, 29 KB). A single
family keeps the critical path short; hierarchy comes from weight, size and tracking
rather than a second typeface. There are no third-party font requests.

---

## Brand assets

| File | Use |
| --- | --- |
| `logo-mark.svg` | the mountain "CV" mark alone |
| `logo-stacked.svg` | primary lockup, matches the client's own artwork |
| `logo-stacked-reverse.svg` | the same, for navy grounds |
| `logo-lockup.svg` | horizontal, for headers and letterheads |
| `logo-mono-reverse.svg` | single ink — one-colour print, vinyl, embroidery |
| `favicon-source.svg` | squared mark on navy, the source for every favicon size |
| `sprite.svg` | the mark as a `<symbol>`, inlined once in `index.html` |

The mark was **vectorised from the client's supplied raster artwork** by contour
tracing (`scripts/trace-logo.mjs`), not redrawn by hand and not an AI image trace.
It measures **95.8% IoU** against the original, with the remainder being antialiased
edge pixels. The result is a single 2.3 KB path that recolours with CSS.

To regenerate the family after replacing the source artwork:

```bash
node scripts/trace-logo.mjs
node scripts/build-brand.mjs
npm run assets
```

The wordmark in the standalone lockups is live `<text>`. **For print or sign-writing
handoff, open a lockup in a vector editor and convert the type to outlines.** On the
website itself the wordmark is real HTML text, so it stays crisp and searchable.

---

## Regenerating images and video

```bash
npm run assets
```

Reads the masters in `assets/design/` and writes every AVIF/WebP rendition, the
favicon set, the OG card and both video encodes. Sizes are written to
`assets/img/manifest.json`, which is where the `width`/`height` attributes in the
HTML come from — that is what holds Cumulative Layout Shift at zero.

Some large source files are not committed to keep the repo small. If
`npm run assets` reports a missing input, that master lives outside the repo.

---

## Accessibility & motion notes

- Every interactive element has a visible focus ring; none are removed.
- The before/after slider is a real `<input type="range">`, so pointer, touch and
  arrow keys all work, and it announces itself to screen readers.
- Form errors appear as text next to the field with an icon — never colour alone.
- `prefers-reduced-motion` removes the hero video entirely (the static poster is
  shown instead) and disables every scroll reveal and transition.
- The hero loop is muted, `playsinline` and poster-first, so it never becomes the
  LCP element.
