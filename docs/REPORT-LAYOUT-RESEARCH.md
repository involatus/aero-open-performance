# Report layout research

How real performance and W&B outputs, and human-factors guidance, present what our Report shows, and what `src/lib/report/report.ts` should change. Researched 2026-11-10.

## 1. Findings

| # | Pattern | Evidence |
| --- | --- | --- |
| F1 | **Key numbers in a strip at the top, labelled with short defined abbreviations.** ForeFlight's W&B screen heads with `BEW / ZFW / TOW / LDW` and one value each. Its takeoff/landing page has a Header that "provides at-a-glance values for important weight, distance, and speed information". | [S1] §5.5 p. 70 (screenshot), Definitions p. 4. [S2] "Takeoff & Landing Page Structure" |
| F2 | **No source line on every row.** ForeFlight's Load Summary PDF is an envelope chart, an item/weight list and a condition table (`Weight / Limit / CG`, one line each for ZFW, Ramp, Takeoff, Landing), with one "Created … Z" stamp and one "Computed using model version …" line for the whole page. | [S1] §5.5 p. 70 |
| F3 | **The raw weather goes once, at the end of its block.** "The original text of the METAR or forecast is displayed at the bottom of the section." | [S2] "Weather" |
| F4 | **Wind is given as components, not prose.** "Known winds are broken into headwind/tailwind component and crosswind component for each runway." Variable wind has a standard short form: "the wind may be coded as VRB in place of the three-digit wind direction … VRB03KT". | [S2] "Runway List". [S3] METARs › Wind direction |
| F5 | **Limits sit inline with the item, and fuel in its own unit sits on the fuel row.** The FAA forms write `Baggage A (100 max.)`, `Weight (3,100 lb max.)`, `Fuel loading (gallons) 80` and `Less fuel to destination (gallons) 35`. The column order is fixed: Item · Weight · Arm · Moment, with a CG column on the total. | [S4] Fig. 5-3 p. 5-3, Fig. 6-6 p. 6-3 |
| F6 | **Supplemental detail goes apart from the main content.** "Include supplemental detail only when necessary … separate the supplemental information from the presentation of the actual steps." | [S5] §4.1.2 p. 4-1 |
| F7 | **Use only defined, common abbreviations; use all caps sparingly; group with white space.** "Only use abbreviations that are defined and commonly used in the industry." "Text in all capital letters is harder to read … Use all capitals very sparingly." Printed ground documents may differ from in-flight formats. | [S5] §§4.3.3, 4.5, 4.5.4, 4.5.5, pp. 4-2 to 4-3 |
| F8 | **Chunk related items and separate the chunks physically. Put the most critical items first.** | [S6] §7.1 p. 48; Appendix A (7), (10) p. 66 |
| F9 | **Define the abbreviations once.** ForeFlight's guide has a single Definitions table (BEW, LDW, TOW, ZFW). Responses "should portray the desired status or the value". | [S1] p. 4. [S6] Appendix A (4) p. 66 |

**Not fetched, so not cited:** HF-STD-001B (ROSA P returned Access Denied), Tufte's books (no primary pages online), Garmin Pilot W&B PDF output (no Garmin document found), Boeing OPT and Airbus FlySmart output samples (no manufacturer document found; only accident reports), ForeFlight's TOLD summary PDF (the support pages describe its sections but show no sample).

## 2. What is wrong now (verified)

The Report was rendered in Node with pdfmake 0.3.13 and the real fonts, with test-dr-style, LSZF → LSZS, VRB 02 kt and "Tailwind 3 kt". Word positions were measured with `pdftotext -bbox`.

- **The overflow cause.** The page `columns` are `['*','*']`. In `node_modules/pdfmake/js/columnCalculator.js` `buildColumnWidths`, when the minimum widths don't fit ("case 1"), every star column gets `starMaxMin`, the largest minimum width of any star column. The Conditions-with-L table has `noWrap` value cells, and its `colSpan: 2` rows (conditions, time, flow, tanks) pass their noWrap minimum on. So one long value widens Conditions, and Mass and balance gets the same width and moves right:
  - With the default labels, it fits: "Moment" xMax is 561.8 of 565.3.
  - With a Landing condition of "Any surface (no surface correction in the manual)", Mass and balance starts at x 383.9 instead of 306.6, and its last columns are off the page.
  - With the landing wind-for-distances value "Tailwind 3 kt chosen, but the entered tailwind is stronger, so it is used", Mass and balance leaves page 1 entirely.
- **"VRB °".** `shown()` in `createReportData` appends `f.unit` even to `VRB`. Directions also print as "250 °" with a space.
- **The ", confirmed" on every source is redundant.** `canReport()` refuses a Report unless every Prefilled Value is confirmed (SPEC, Reports).
- **Repeated content.** The condition is in both the band label and the Conditions rows. Wind for distances is in both the band ("Distances use: …") and a Conditions row. The fuel tanks are in both Conditions (L) and Mass and balance (kg).
- **Prose band.** `placeText()` builds `"2 kt tail. Variable wind, applied as a tailwind. Distances use: Tailwind 3 kt"`, and `windPart()` splits it at ". " into three grey lines.
- **All caps.** `caps()` and `heading()` uppercase every label, including the Data Owner's long condition label. That goes against F7.

## 3. Recommendations, mapped to code

### R1 Sources: markers plus one legend per airfield (F2, F6, F9)

In `reportDocument`, derive the markers from the existing `conditions[].source` strings. This needs no data-model change, so old Reports still render.

- Strip ", confirmed".
- Leave "Entered by pilot" unmarked and say so once in the legend.
- Give every other distinct source in a column a superscript letter in the cell: ᴬ airfield list, ᴹ METAR, ᴾ chosen by pilot, ᴰ aircraft data.
- Under the table, print one line per airfield, e.g. `LSZF ᴬ airfield list LSZF 2026-11-08 · ᴹ METAR LSZH`, plus "Unmarked: entered by pilot", then each raw METAR in mono.
- This meets "each value's source" with no SPEC change.

### R2 Compact wind and band (F1, F4, F7)

- Add optional `windShort { reported, used }` to `results` and `landing` in `ReportData`, filled in `createReportData` from `at.wind` and `windChoiceAt`. Fall back to the `wind` string for old Reports.
- Band: `VRB 02 kt → TW 3 kt` and `250° 10 kt → HW 8 · XW 6`, plus one footnote "VRB is applied as tailwind". This keeps the SPEC statement about variable wind.
- When the entered tailwind is stronger: `TW 5 kt (entered, > chosen)`. Change the Report only, and keep the screen wording.
- Put an abbreviation legend (HW/TW/XW/DA/PA/VRB) in the page footer.
- Band distance labels `Ground roll` / `50 ft`, with the mass on one line under them.

### R3 Shorter labels (F7)

- `distanceCell`: bold sentence-case `Takeoff`, and the condition on its own wrapping 7.5 pt line, not `caps()`.
- Drop the Takeoff and Landing condition rows from the Conditions table. Mark them ᴾ in the band instead.
- Merge Wind from + Wind speed into one `Wind` row. Fix `shown()` to skip the unit for VRB and to write ° without a space.
- Runway as `08 (080°)`, and "Wind used" instead of "Wind for distances".
- Use sentence case for `heading()`, `caps()` and the band titles. Keep caps only for the PRE-RELEASE banner.

### R4 Fix the overflow

1. Give the page columns fixed widths: `{ width: 250 }` | `{ width: '*' }`. A fixed column never receives `starMaxMin`.
2. Remove `noWrap` from the Conditions-with-L cells, and use widths `[64, '*', '*']`.
3. With R3 and R5, no `colSpan` rows remain.
4. Add a layout test: render with the long condition label and the kept-tailwind wording, and assert no word's xMax is greater than 565.28. `report.test.ts` only checks strings today.

Stacking Mass and balance under Conditions also works. It costs about 150 pt of height and pushes Limits to page 2.

### R5 Fuel inputs into Mass and balance (F5)

- Tank rows become `Front tank (20 L)`.
- The burn line becomes `Burn plan Evenly · 1.0 h × 20 L/hᴰ = 20 L`.
- Remove `time`, `flow` and `fuel:*` from the Conditions table, with or without L.

### R6 Page 2

- Page 1 holds the heading, band, Conditions + sources + METARs | Mass and balance + chart, and Limits.
- The first `Working` table gets `pageBreak: 'before'`. The working is supplemental (F6).
- The footer section stays last, as SPEC orders it, and lands on page 2.
- Add the responsibility line and the abbreviation legend to the per-page `footer()`. Drop the duplicate Report ID from the heading.

### Mockup, page 1, landing elsewhere

```
Performance report                                       2026-11-08 12:30 UTC
HB-KXY  LSZF 08 → LSZS 21                                        A. Pilot
DR400/140B · Standard · Data rev. 3
┌────────────────────┬────────────────────┬───────────────────────────────────┐
│ Takeoff  LSZF 08   │ Landing  LSZS 21   │             LSZF          LSZS    │
│ Hard ᴾ             │ Any surface (no    │ DA       5,863 ft      6,493 ft   │
│                    │ surface corr.) ᴾ   │ PA       4,764 ft      4,819 ft   │
│ Ground roll  50 ft │ Ground roll  50 ft │ Wind    VRB 02 kt    250° 10 kt   │
│ 241 m      402 m   │ 150 m       –      │ Used    TW 3 kt ᴾ     HW 8·XW 6   │
│ 608.8 kg           │ 594.4 kg           │ VRB is applied as tailwind        │
│ ⚠ warnings…        │ ⚠ outside table…   │                                   │
└────────────────────┴────────────────────┴───────────────────────────────────┘
Conditions                          │ Mass and balance
              LSZF        LSZS      │ Item                 kg      m    Moment
Elevation   1,450 m ᴬ  1,400 m ᴬ    │ Empty             500.0  0.360   180.00
Runway      08 (080°)  21 (210°)    │ Pilot              80.0  0.500    40.00
QNH         1013 hPaᴹ  1005 hPaᴹ    │ Front tank (20 L)  14.4 -0.200    -2.88
OAT         15 °C ᴹ    20 °C ᴹ      │ Rear tank (20 L)   14.4  1.100    15.84
Wind        VRB 02 ktᴹ 250° 10 ktᴹ  │ Takeoff           608.8  0.383   232.96
Wind used   TW 3 kt ᴾ  As entered ᴾ │ Landing           594.4  0.381   226.48
LSZF ᴬ airfield list 2026-11-08 ·   │ Burn plan Evenly · 1.0 h × 20 L/hᴰ = 20 L
     ᴹ METAR LSZH                   │ ┌ CG chart ─────────────────────────┐
LSZS ᴬ airfield list 2026-11-08 ·   │ │                                   │
     ᴹ METAR LSZS                   │ └───────────────────────────────────┘
Unmarked: entered by pilot          │
METAR LSZH 081220Z VRB02KT …        │
METAR LSZS 081220Z 25010KT …        │
Limits
OK Max takeoff 608.8 ≤ 770 kg       OK CG takeoff 0.383 in 0.30–0.45 m
OK Max landing 594.4 ≤ 770 kg       OK CG landing 0.381 in 0.30–0.45 m
──────────────────────────────────────────────────────────────────────────────
The pilot in command is responsible for verifying these results.
HW/TW/XW head/tail/crosswind · DA/PA density/pressure alt. · VRB variable
AOP-20261108-1A2B · Page 1 of 2
```

## 4. Spec flags

| Recommendation | Needs a change to |
| --- | --- |
| R2: band abbreviations (HW/TW, Ground roll / 50 ft) | **SPEC** Reports §2, "same labels as on screen". Change the screen too, or relax that line. |
| R3 optional: a short condition label | **FORMAT.md**, an optional `shortLabel` on performance conditions. Not needed if the long label wraps. |
| R1, R3, R5, R6, `windShort` | None. Each value keeps a stated source, the variable wind stays stated, the section order is kept, and the new fields are optional. |

## Sources

- [S1] ForeFlight, *Weight and Balance Guide* v17.11, Definitions p. 4; §5.5 p. 70. https://cloudfront.foreflight.com/docs/ff/17.11/Weight%20and%20Balance%20Guide.pdf
- [S2] ForeFlight, "Takeoff & Landing Distance Support", "Takeoff & Landing Page Structure" (Header, Runway List, Weather). https://www.foreflight.com/support/told
- [S3] NOAA Aviation Weather Center, Data help, METARs › Wind direction. https://aviationweather.gov/help/data/
- [S4] FAA-H-8083-1B *Aircraft Weight and Balance Handbook* (2016), Fig. 5-3 p. 5-3, Fig. 6-6 p. 6-3. https://www.faa.gov/sites/faa.gov/files/2023-09/Weight_Balance_Handbook.pdf
- [S5] FAA AC 120-71B (2017), Ch. 4, §§4.1.2, 4.3.3, 4.5, 4.5.4, 4.5.5, pp. 4-1 to 4-3. https://www.faa.gov/documentLibrary/media/Advisory_Circular/AC_120-71B.pdf
- [S6] Degani & Wiener, NASA CR-177549, §7.1 p. 48; Appendix A (4), (7), (10) p. 66. https://ntrs.nasa.gov/api/citations/19910017830/downloads/19910017830.pdf
- Code: pdfmake 0.3.13 `node_modules/pdfmake/js/columnCalculator.js` `buildColumnWidths`, "case 1".
