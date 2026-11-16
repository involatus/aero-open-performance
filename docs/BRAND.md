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
| `aop-mark-light.svg`, `aop-mark-dark.svg` | The logo without a background | Documents |
| `lockup-*.svg` | The logo with the full name | README |
| `og.svg` | 1200×630 link preview | `static/og.png` |
| `social-preview.svg` | 1280×640 GitHub social preview | Uploaded by hand in the repository settings |

The app reads `aop-mark.svg` and the illustrations straight from this folder (`src/lib/brand.ts`), so they are never copied or redrawn. Keep the logo the same everywhere. Don't redraw it, recolour the quarters or set the name beside it in another arrangement.

## In the app

The brand stays small, so the pilot's data comes first.

- **Header**: the AoP mark first, at 30 px (26 px on a phone), then the Operator's logo, then the tabs. A 3 px navy line runs along the top. In dark mode the whole header is navy, and the mark's square is drawn darker to show on it.
- **Accents**: the open tab and the Reports button, when open, get a line in the accent colour along the bottom; so does the current step, whose number also turns accent. The takeoff point on the CG chart, on screen and on Reports, is the centre of gravity symbol from the logo.
- **Menu**: an About block with the mark, the name and the app version, then the Operator's logo and the data line.
- **Reports**: the mark and name, small, at the top left of page 1, with the Operator's logo at the top right. The closing line names the app and its version.
- **Error page**: the mark above a card with the way back.
- **Admin**: an amber line and an ADMIN tag beside the mark instead of the navy line, so the editor is never mistaken for the pilot view.
- **Illustrations**: the aircraft on the first start, the working propeller while the first data downloads, and send report on an empty Reports list.

## Operator logo

A club can add its own logo in the admin Settings or with `npm run data -- publish --logo`. It travels in the release index (see `docs/FORMAT.md`), so it is checked with the data, works offline and changes only with a new release. It shows in a fixed box: 40 px high and at most 200 px wide in the header (30 × 130 px on a phone), scaled to fit and never cropped. Fine lines and small type blur at that size, so a club with a detailed logo should upload a simplified one, without its tagline. Without a dark-mode version, the light logo sits on a small white plate in dark mode. Without a logo, the header shows only the AoP mark.

## Module icons

`docs/brand/icons` holds larger illustrations for the parts of the app: mass and balance, takeoff and landing, conditions, fuel, aircraft, send report, and working (loading). They are for headers, empty states, PWA shortcuts and similar large places, through `Illustration.svelte`. Small icons in the interface stay Lucide, as `Icon.svelte` says.

## PWA

- **Manifest**: served by `src/routes/manifest.webmanifest`, so it can name a club's own icons. The plain icons are `icon-*` (any), `icon-maskable-*` (Android adaptive icons) and `icon-monochrome-512` (one-colour system icons).
- **Shortcuts**: long-pressing the installed app offers *New calculation* (the aircraft illustration) and *Reports* (the send report illustration). They open `/?open=new` and `/?open=reports`.
- **Splash screens**: iOS and iPadOS show a splash screen only when an image matches the exact screen size and orientation, so `static/splash` holds one per device size, in portrait and landscape. The list is `SPLASH_SCREENS` in `src/lib/splash-screens.ts`. When Apple releases a new screen size, add it there and run `npm run brand`. The service worker doesn't cache them, because iOS fetches its own image once, at install.
- **Club icons and splash screens**: every club deploys the same code, so a club's own versions can't be files in the repository. The server draws them from the logo in the club's published data (`src/lib/server/club-brand.ts`, which also holds the layouts; the routes only adapt HTTP) and keeps them cached. `app.html` and the manifest point at `/brand/<file>`, which answers with the club's image, or sends the device on to the plain file in `static/` when the data has no logo.
  - *App icon*, the white band: the AoP mark on navy at the top, the club's light logo on a white band across the lower two thirds. The maskable icon draws the same inside Android's safe zone. The one-colour icon stays AoP, because a system draws it as a bare shape.
  - *Splash screen*: the club's dark logo in the middle of the navy, with a line at the foot holding the AoP mark and name (`splash-signature.png`, drawn by `npm run brand`, because the server's renderer has no web fonts). Without a dark logo, the light logo sits on a white card instead, as it does in the app in dark mode.
  - A new logo reaches the icons with the next publish. iOS only takes a new icon or splash screen when the app is added to the home screen again.
- **Install popup**: the app offers to install itself when it isn't running as an installed app. It uses the browser's install dialog where there is one (Chrome, Edge, Android), or shows the Share menu steps on iOS and iPadOS. After *Not now* it waits 14 days before asking again.

## Colours

The brand uses the app's own colours from `src/app.css`, where `--brand`, `--header`, `--header-line`, `--brand-tile` and `--tab-mark` hold the brand's part: navy `#14263a` behind the logo, `#f4f7fa` for the drawing, and the accent `#6db3ea` (`#1d5c96` on light backgrounds) for the quarters of the centre of gravity symbol. The text is IBM Plex Sans, like the app.
