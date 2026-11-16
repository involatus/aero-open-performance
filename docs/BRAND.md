# Brand

The sources are SVG files in [docs/brand](brand). `npm run brand` turns them into the app icons, the favicon, the link preview image and the README images. Edit a source, then run it again. It needs Playwright's Chromium (`npx playwright install chromium`), or another Chrome named in `CHROME_PATH`.

## Name

- **Aero Open Performance** is the full name. Use it on first mention, in titles and in the manifest's `name`.
- **AoP** is the short name: the home-screen label (`short_name`, `apple-mobile-web-app-title`) and later mentions in text.
- **AOP-** in capitals stays the prefix of report IDs and PDF file names. It is an identifier, not the name.

## Marks

| File | What it is | Where it goes |
| --- | --- | --- |
| `aop-mark.svg` | The logo: an A, and a P whose bowl is the centre of gravity symbol | Home-screen icon, Apple touch icon |
| `aop-mark-maskable.svg` | The logo inside the maskable safe zone (the middle 80%) | Android adaptive icons |
| `aop-mark-monochrome.svg` | The logo in white on transparent, read only as a shape | System icons drawn in one colour |
| `aop-compact.svg` | The P alone, for sizes too small for two letters | Favicon |
| `aop-mark-light.svg`, `aop-mark-dark.svg` | The logo without a background | App header, documents |
| `lockup-*.svg` | The logo with the full name | README |
| `og.svg` | 1200×630 link preview | `static/og.png` |
| `social-preview.svg` | 1280×640 GitHub social preview | Uploaded by hand in the repository settings |

Keep the logo the same everywhere. Don't redraw it, recolour the quarters or set the name beside it in another arrangement.

## Module icons

`docs/brand/icons` holds larger illustrations for the parts of the app: mass and balance, takeoff and landing, conditions, fuel, aircraft, send report, and working (loading). They are for headers, empty states, PWA shortcuts and similar large places. Small icons in the interface stay Lucide, as `Icon.svelte` says.

## Colours

The brand uses the app's own colours from `src/app.css`: navy `#14263a` behind the logo, `#f4f7fa` for the drawing, and the accent `#6db3ea` (`#1d5c96` on light backgrounds) for the quarters of the centre of gravity symbol. The text is IBM Plex Sans, like the app.
