# Brand

The sources are SVG files in [docs/brand](brand). `npm run brand` turns them into the app icons, the shortcut icons, the iOS splash screens, the favicon, the link preview image and the README images. It also writes the splash screen links into `src/app.html`, between the two marker comments. Edit a source, then run it again. It needs Playwright's Chromium (`npx playwright install chromium`), or another Chrome named in `CHROME_PATH`.

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

## PWA

- **Manifest icons**: `icon-*` (any), `icon-maskable-*` (Android adaptive icons) and `icon-monochrome-512` (one-colour system icons).
- **Shortcuts**: long-pressing the installed app offers *New calculation* (the aircraft illustration) and *Reports* (the send report illustration). They open `/?open=new` and `/?open=reports`.
- **Splash screens**: iOS and iPadOS show a splash screen only when an image matches the exact screen size and orientation, so `static/splash` holds one per device size, in portrait and landscape. The list is `SPLASH_SCREENS` in `scripts/brand.ts`. When Apple releases a new screen size, add it there and run `npm run brand`. The service worker doesn't cache them, because iOS fetches its own image once, at install.
- **Install popup**: the app offers to install itself when it isn't running as an installed app. It uses the browser's install dialog where there is one (Chrome, Edge, Android), or shows the Share menu steps on iOS and iPadOS. After *Not now* it waits 14 days before asking again.

## Colours

The brand uses the app's own colours from `src/app.css`: navy `#14263a` behind the logo, `#f4f7fa` for the drawing, and the accent `#6db3ea` (`#1d5c96` on light backgrounds) for the quarters of the centre of gravity symbol. The text is IBM Plex Sans, like the app.
