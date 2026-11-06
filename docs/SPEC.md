# Aero Open Performance: build spec

An open-source, offline-capable web app for mass and balance and takeoff and landing performance on piston aircraft. Any club, school or aircraft owner can deploy their own copy. Vocabulary is in [GLOSSARY.md](../GLOSSARY.md).

**Status:** pre-release, not for flight. The label stays until the [release gate](#removing-the-pre-release-label) is met.

## Principles

- **Simple, with one way of doing things.** There is one flow and one report, with no per-club variants.
- **The pilot is responsible.** The tool does the arithmetic, shows its working and never hides what it assumes.
- **Prefilled Values are suggestions.** The pilot must confirm or overwrite each one.
- **No aircraft logic in code.** Aircraft behaviour is described entirely by Aircraft Data. The only built-in conservative rules are rounding distances up and applying variable wind as a tailwind.
- **Open and modular.** Weather, sending and the admin GUI are optional modules.

## Modules

| Module | Purpose | Required? |
| --- | --- | --- |
| Calculation engine | Pure code that turns inputs and Aircraft Data into results | Yes |
| Aircraft data format | Published schema and documentation | Yes |
| Pilot app | Offline PWA | Yes |
| Command-line checker | The publish checks, for hand-written files | Without the admin GUI |
| Weather | METAR proxy and prefill | No; falls back to manual entry |
| Sending | Report endpoint with one recipient, postponed | No; the share sheet is used |
| Admin GUI and login | Aircraft setup, Operator settings, publishing | No; hand-written files also work |

Each Operator deploys their own copy, with one settings file and their own Aircraft Data. There is no shared service.

## Stack

SvelteKit 3 with Svelte 5, client-rendered with prerendered shells; Tailwind CSS 4 and Bits UI, with all colours in one set of tokens; the built-in service worker; `idb-keyval`; `pdfmake`; Valibot; Vitest, `fast-check` and Playwright. Admin only: SJSF generated forms, native input tables with Excel paste, and Better Auth. Hosting is not final, so keep host-specific code behind small layers. Licence: Apache-2.0.

## Aircraft data format

One strict JSON file per registered aircraft per Data Release, self-contained with no inheritance. It has a SHA-256 over its RFC 8785 canonical form, held in a small index file. Valibot is the single definition, exporting JSON Schema 2020-12 (set `target: 'draft-2020-12'`), with Ajv cross-checking in the command-line tool. Avoid tuples. `formatVersion` follows SemVer, and the app refuses a newer MAJOR or MINOR with a clear message.

A file contains:

- **Configurations**, such as with or without skis, each with its own weighing and optionally its own limits and performance data.
- **Loading Stations** with arm, optional limit and named seat positions; **tanks** with arm, capacity and density; **combined limits** across stations.
- **Mass limits:** separate maximum takeoff and landing masses.
- **CG Envelope** as mass and arm points. Limits printed as %MAC are stored as printed, with the MAC data.
- **Burn Plans:** the allowed plans and the preselected one. A plan burning more than a tank holds is flagged.
- **Conditions** a pilot can choose, each mapped to its steps.
- **Notes:** manual rules the tool can't calculate, which the pilot confirms.
- **Performance Steps:** an ordered list for each result, mirroring the manual. The Data Owner uses only what the manual needs. Tables are stored exactly as printed.
- **Optional crosswind figure,** which only produces a warning.
- **A source on every table, limit, factor and weighing,** such as document, revision, page and date.
- **Hand-calculated cases** with inputs, expected results, author and date.

Values stay in the manual's own units with the unit stated, and are converted only during calculation.

### Performance Steps

| Step | Behaviour |
| --- | --- |
| Table lookup | Linear across any number of named axes. An exact axis match returns the stored cell, never a computed value |
| Fixed value | A single printed figure |
| Factor | Multiply, with a stated reason |
| Mass correction | Stated reference mass and exponent. Applies below and above the reference |
| Wind correction | Proportional or stepped, with a valid range |
| Surface factor | Applies to ground roll, and states whether the added distance carries into the total |
| Ratio | Ground roll as a share of total, or the reverse |

Each table axis states what happens below and above its range: no result, nearest value, or nearest value with a warning. Altitude axes state their basis: pressure altitude, density altitude or elevation. Every result carries the conditions its manual assumes, and shows a warning when the inputs differ. Cases with no data show "No data: pilot's judgement". Where a manual has no wind correction, the wind is recorded and the tool says it did not change the distance. Files with any of these choices missing can't be published.

## Pilot app

No login. On first launch with no data, one message asks the pilot to connect once. The demo aircraft appears only in a clearly labelled demo mode.

**Flow:** short steps, Load, Fuel, Conditions and Send, with Back and Next and direct jumps, beside always-visible results, limits and CG chart. A summary stays visible at the top. The working is folded away. Performance uses the masses from M&B, with no separate entry. Landing mass comes from flight time, fuel flow and Burn Plan.

**Usability rules:**

- An in-app keypad enters numbers, because iPadOS shows a full layout for numeric input modes. Each field sets its decimals, minus and plausible range. The first key replaces the value, and "Next field" moves on.
- The system keyboard is used only for text, with the right capitalisation and autofill and no autocorrect.
- Quick buttons cover common changes, such as ±5 kg, None, Full and common flight times.
- Steps show "Done" or how many items are left. To-do items and exceeded limits jump to the right place.
- Field problems appear at the field and state what is expected.
- Keypad keys are at least 72 points and buttons at least 52. Status is shown in words as well as colour.

**Calculations** are shown in tabs and saved on the device. A tab is named by registration, departure identifier once entered, and date, with a number if names repeat. "Next flight" copies aircraft, Configuration, load and pilot name; fuel starts from the calculated landing fuel as a Prefilled Value; elevation, runway heading, weather, flight time and note confirmations are cleared. Pilots delete tabs themselves. A Calculation older than 7 days asks for fresh weather.

**Altitude:** the tool calculates pressure and density altitude from elevation, QNH and OAT. Density altitude is display only unless a table's axis states it as its basis.

**Rounding:** calculate unrounded and round for display. Distances round up to the next whole metre or foot, in the manual's unit, with a tiny floating-point tolerance. Ground roll rounds from the unrounded value. Limit checks use unrounded values, and a value exactly on a limit passes.

**Out of the tool's scope, left to the pilot:** airfield data, available distance and runway margin, slope, and local weather judgement.

## Weather

Weather loads only when the pilot asks, by station code or "Nearest" with device location permission. A proxy keeps the provider key private and caches each result for 15 minutes. The first provider is CheckWX, behind a small layer so others can be added; each Operator uses their own key. AviationWeather.gov is the tested fallback if CheckWX's free tier doesn't hold up.

- **Failures:** no connection, service or key failure, or no station all fall back to manual entry with the reason shown. They never block a calculation.
- **Old reports:** a report over 60 minutes old is prefilled with a strong warning.
- **Incomplete reports:** prefill only what is stated. A range prefills the main direction and flags the range, and gusts prefill steady wind and flag the gust. The raw METAR stays visible.
- **Variable wind:** always applied as a tailwind at its full speed, whether from a METAR or chosen by the pilot. The tool says so on screen and in the Report. A typed direction replaces it.
- **Newer reports:** replace Prefilled Values, require confirmation again and show what changed. They never touch anything the pilot typed.

## Reports

One standard PDF, one page where possible, in English. Sections, in order:

1. **Heading:** aircraft, Configuration, UTC date and time, pilot's typed name, departure airfield as free text.
2. **Results,** with the same labels as on screen.
3. **Conditions,** with each value's source and the raw METAR.
4. **Mass and balance,** with Burn Plan, limit results and CG chart.
5. **Working,** with table values and manual sources.
6. **Footer:** Report ID, tool version, Data Release, aircraft revision, last data check, confirmed notes, and the statement that the pilot in command is responsible for verifying the results.

A Report needs the pilot's name, every Prefilled Value and note confirmed, and no exceeded limit. An exceeded limit blocks it, with no setting to change that. A "no data" result doesn't block it, and the Report says so. The name is for traceability and isn't a signature.

Reports never change. Each has a unique ID, and changed inputs make a new Report. Delivery shows one of "Not sent", "Sent" (the endpoint accepted it) or "Shared, delivery unknown". Unsent reports retry while the app is open and online, with an idempotency key. Reports stay on the device only, for 90 days, except "Not sent" ones, which stay until sent or deleted. The documentation states that clearing browser data or losing the device loses them.

## Data Releases and updates

A Data Release covers all of an Operator's aircraft and is permanent. Each aircraft file has its own revision, and Reports cite both. To undo a release, republish an earlier version under a new number. Pilots' devices read only the static release files and index, never a database.

When online, the app checks when it opens and when a connection returns, at most hourly, and shows a notice of what changed. It installs only when the pilot taps Install, verifying the checksum and schema first. If that fails, it keeps the last verified release and says so. After an install, each open Calculation recalculates, says so and clears its confirmations.

A release can mark an aircraft unavailable with a required reason. The app blocks that aircraft as soon as it sees the notice, without waiting for Install. A device that stays offline can't learn this, and the documentation says so.

The app checks the stored data on every start and before each Report, and refuses to calculate if it's missing or fails. First launch installs by itself, because nothing else can happen until data exists. Being offline never blocks a calculation. It shows the data version and last-check date on screen and in Reports, and warns strongly after 30 days without a check.

## Admin GUI

Optional, online and mainly for a laptop, while still working on an iPad. It covers aircraft setup, Operator settings and publishing, and doesn't store Reports.

- **Storage:** file storage behind a small layer. Drafts are one file per aircraft, and releases are permanent files. A database comes later only if Operators need separate accounts.
- **Login:** Better Auth without a database, with Google sign-in and an email allow-list in the host's settings, checked on every request. Set `requireEmailVerification: true`. Sessions last 8 hours. Removing an admin means editing the list and redeploying. There is no password fallback.
- **Tables:** native input tables with paste from Excel, then a second pass with first values hidden, highlighting any differences. No OCR at first.
- **Steps:** forms build each result's ordered steps, with a live test panel. An aircraft can be copied as an independent start; its tables and sources must then be entered and checked again.
- **Publish:** disabled until required values and sources are present, all out-of-range choices are set, every table has been entered twice and matches, every unusual value has been acknowledged, and every hand-calculated case passes. No override.
- **Security updates:** copies don't update themselves. The admin area shows an "update available" notice, with documented update steps and Dependabot recommended.

## Verification

This makes an undetected error very unlikely, but can't prove there are none. Any result can still be recalculated by hand from its Report.

**Tool gate, on every code change:**

- Four fictional test aircraft in the repo: DR-style (table by surface, factor, mass correction, ratio), SR22-style (three-axis table, stepped wind, surface factors), GlaStar-style (lb, inches, %MAC, combined limits) and Kitfox-style (one fixed landing value).
- Tests for exact cells, values between cells, behaviour at and beyond every limit, units and every Burn Plan.
- A small Python calculator, written from the format documentation without reading the app's code. At least 100,000 random inputs must match within 0.001 m before rounding and exactly after it. A person resolves any difference.

**Data gate, on every Data Release:** for each selectable takeoff and landing condition, one hand-calculated case on a table value and one between values, plus forward-loading, aft-loading and over-limit M&B cases. Expected results are typed by hand and must match the displayed value exactly. The GUI never copies the tool's result into them.

### Removing the pre-release label

All checks pass, the licence and liability wording has been reviewed, and someone who didn't build the tool recalculates at least 20 reports by hand from the fictional aircraft, with every difference explained.

## Build order

0. This spec.
1. **App skeleton:** installable offline app with a test PDF, deployed for the real-iPad test.
2. **Format and engine:** schema, four test aircraft, tests and the Python calculator.
3. **Pilot flow:** steps, keypad, live results, limits, CG chart and tabs on the real engine.
4. **Reports:** PDF, device storage, delivery states and share sheet.
5. **Weather:** METAR proxy and prefill. The report-sending endpoint is postponed, so Reports go through the share sheet for now.
6. **Data Releases:** publishing format, integrity checks, manual updates and the command-line checker.
7. **Admin GUI and login.**

After slice 6, an Operator can run the tool with hand-written aircraft files.

## Still unverified

- On a real iPad, these passed: installing, offline start, keeping data across restarts, and creating and sharing a PDF offline. A report shared to Mail offline also arrived after reconnecting. Still untested: data retention over weeks, and low storage.
- The admin table grid on a real iPad and with real Excel. Paste is tested only with a simulated clipboard.
- Google sign-in and Vercel Blob storage on real hosting. Automated tests use a test-only login and a local folder.
- Whether CheckWX's free tier includes every endpoint used, and its terms for long-term use.
- Final hosting, including Vercel Hobby's non-commercial limit and file storage limits.
