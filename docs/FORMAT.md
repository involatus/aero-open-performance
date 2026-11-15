# Aircraft data format and calculation rules

Format version 0.4.0. Version 0.4.0 added `surface` on conditions and `"VRB"` as a wind direction, 0.3.0 added `appliesTo` on notes and `carries` on stations, and 0.2.0 added Operator Rules to the release index. Older files are still read. This document is the complete definition of how an aircraft file is read and calculated. Another implementation must be able to produce the same results from this document alone. The machine-readable shape is in [schema/aircraft.schema.json](../schema/aircraft.schema.json), and examples are in [aircraft-examples/](../aircraft-examples/). All example values are invented.

One strict JSON file describes one registered aircraft. Unknown fields are errors. Every value stays in the manual's own units. Nothing has a hidden default.

## Top-level fields

| Field | Meaning |
| --- | --- |
| `formatVersion` | SemVer. An app refuses a file with a newer MAJOR or MINOR than it supports |
| `registration`, `type`, `revision` | Identity. `revision` is a whole number from 1 |
| `fictional` | Optional. `true` for invented data |
| `units` | `mass` is `kg` or `lb`; `arm` is `m`, `cm` or `in`; `volume` is `L` or `USgal` |
| `manualUnits` | Optional, same shape as `units`. The units printed in the manual: the admin editor shows and accepts values in these and stores them converted to `units`, using the exact constants below. Calculations never read it |
| `display` | `massDecimals` and `armDecimals`, used for showing values and comparing hand-calculated cases |
| `sources` | Named sources: `document`, and optional `revision`, `page`, `date`. Every table, limit, factor and weighing refers to one |
| `stations` | Loading Stations. Optional `carries`: `people` or `baggage`, so a pilot's saved values are offered only where they fit; without it the app guesses from the name |
| `tanks` | `id`, `label`, `arm`, `capacity` (volume), `density` (mass per volume), `source` |
| `combinedLimits` | `id`, `label`, `stations`, `maxMass`, `source` |
| `massLimits` | `maxTakeoff` and `maxLanding`, each `{ value, source }` |
| `envelope` | The CG Envelope: `points` and `source` |
| `mac` | Optional: `leadingEdgeArm`, `length`, `source`. Required if the envelope uses `percentMac` |
| `burnPlans`, `defaultBurnPlan` | Burn Plans and the preselected one |
| `fuelFlow`, `crosswind` | Optional `{ value, source }`. Fuel flow is volume per hour, and crosswind is in knots |
| `notes` | Manual rules for the pilot to confirm: `id`, `text`, `source`, and optional `appliesTo` with `configurations`, `takeoffConditions` and `landingConditions` id lists. A note is shown, asked for and printed only when every list it has holds the pilot's choice; a missing list means any choice |
| `tables` | Named tables. Each has `axes`, `outputs`, `source` and, once a person compared it with the manual, `checked` |
| `performance` | `takeoff` and `landing`, each a list of conditions |
| `configurations` | At least one Configuration |
| `handCases` | Hand-calculated cases |
| `acknowledgedUnusualValues` | Optional. Unusual table values already checked against the manual |

A **station** has `id`, `label`, `source`, an optional `maxMass`, and either an `arm`, or `positions` (`{ id, label, arm }`) with a `defaultPosition`.

A **Configuration** has `id`, `label` and `weighing` (`mass`, `moment`, `date`, `source`). Optional `massLimits` and `envelope` replace the top-level ones. Optional `performance` replaces the top-level performance, and the value `"none"` means no performance data exists for it.

## Inputs

| Input | Meaning |
| --- | --- |
| `configuration` | Configuration id |
| `loads` | Per station id: `{ mass, position? }`, in the aircraft's mass unit. A missing station has zero mass. A missing `position` uses `defaultPosition` |
| `fuel` | Per tank id: volume at takeoff. A missing tank has zero |
| `burnPlan` | Burn Plan id |
| `flightTimeHours`, `fuelFlow` | Burned volume = `flightTimeHours × fuelFlow` |
| `elevation` | `{ value, unit }` in `m` or `ft`, or `null` |
| `qnh` | hPa, or `null` |
| `oat` | °C, or `null` |
| `windDirection` | Degrees, `"VRB"` for variable wind, or `null` |
| `runwayHeading` | Degrees, or `null` |
| `windSpeed` | Knots, or `null` |
| `windForDistances` | Optional: `entered` (the default), `none` or `tail3` |
| `landingAt` | Optional: the landing airfield's `elevation`, `qnh`, `oat`, `windDirection`, `windSpeed`, `runwayHeading` and `windForDistances`, when it isn't the departure airfield |
| `takeoffCondition`, `landingCondition` | Condition ids |

Every id must exist in the file. An unknown id is an error in the calling code, not a result.

## Constants

`1 lb = 0.45359237 kg`. `1 US gal = 3.785411784 L`. `1 ft = 0.3048 m`, `1 in = 0.0254 m`, `1 cm = 0.01 m`. `°F = °C × 9/5 + 32`. `EPSILON = 1e-9`.

## Mass and balance

Moment is mass × arm, in the aircraft's units.

1. Start with the Configuration's weighing: its `mass` and `moment`.
2. Add each station: load mass, at the arm of its position or its fixed arm.
3. **Dry** is the total so far.
4. **Takeoff:** add each tank's fuel: mass = volume × density, at the tank's arm.
5. **Burned volume** = `flightTimeHours × fuelFlow`. Apply the Burn Plan to get the volume left in each tank.
6. **Landing:** dry plus each tank's remaining fuel, as in step 4.
7. CG arm = moment ÷ mass. With `mac`, percent MAC = (arm − `leadingEdgeArm`) ÷ `length` × 100.

### Burn Plans

- **`sequence`:** burn each listed tank to empty in order, until the burned volume is used up.
- **`even`:** tanks holding fuel are active. Repeat while the remaining burn exceeds `EPSILON` and any tank is active: share = remaining ÷ number of active tanks; take the smaller of share and that tank's fuel from each active tank, processing the tanks in file order; drop tanks with `EPSILON` or less left.

A `sequence` plan must list every tank. If any burn is left over when the fuel runs out, the flight exceeds the fuel, and every tank is empty at landing.

### Limits

Each check passes when the value is at most the limit plus `EPSILON`, so a value exactly on a limit passes. Checks use unrounded values.

| Id | Value | Limit |
| --- | --- | --- |
| `station:<id>` | Load mass | Station `maxMass`, if any |
| `combined:<id>` | Sum of the listed stations' loads | `maxMass` |
| `tank:<id>` | Fuel volume at takeoff | `capacity` |
| `takeoffMass`, `landingMass` | Mass | `maxTakeoff`, `maxLanding` |
| `takeoffCg`, `landingCg` | Mass and arm | Inside the envelope |
| `fuelBurn` | Burned volume | Exceeded when the flight exceeds the fuel |

When crosswind is above the `crosswind` value by more than `EPSILON`, the mass and balance limits list gains a warning with the id `crosswind`. It is never an exceeded limit, and doesn't count among a distance result's warnings.

**Envelope:** points form a closed polygon in order. A `percentMac` point's arm is `leadingEdgeArm + percentMac ÷ 100 × length`. A point counts as inside if it lies on an edge, meaning that for edge A to B, with x as arm and y as mass, `|(px−ax)(by−ay) − (py−ay)(bx−ax)| ≤ EPSILON` and p is within the edge's bounding box widened by `EPSILON`. Otherwise use the even-odd rule: for each edge, toggle when `(ay > m) ≠ (by > m)` and `arm < (bx−ax)(m−ay)/(by−ay) + ax`.

## Atmosphere

Needs elevation and QNH. With elevation in feet:

```
pressureAltitudeFt = elevationFt + 145366.45 × (1 − (qnh ÷ 1013.25)^0.190284)
```

Density altitude also needs OAT:

```
pressureRatio = (1 − pressureAltitudeFt ÷ 145366.45)^(1 ÷ 0.190284)
densityRatio  = pressureRatio ÷ ((oat + 273.15) ÷ 288.15)
densityAltitudeFt = 145442.16 × (1 − densityRatio^0.234969)
```

ISA temperature for display is `15 − 1.98 × pressureAltitudeFt ÷ 1000`.

## Wind

Needs direction, speed and runway heading. With `angle = (windDirection − runwayHeading)` in radians:

```
headwind  = windSpeed × cos(angle)    (negative means tailwind)
crosswind = |windSpeed × sin(angle)|
```

Variable wind (`"VRB"`) has no direction, so it is a tailwind at its full speed on any runway, with no crosswind: `headwind = −windSpeed`, `crosswind = 0`. It still needs a runway heading.

The crosswind check and the wind shown to the pilot always use the entered wind. The distances use `windForDistances`: `none` plans with no headwind and `tail3` with a 3 kt tailwind. The chosen wind is used as chosen, also when it leaves out a stronger entered tailwind (for example a METAR from another field); the app and the Report then say the entered tailwind is not used.

With `landingAt`, the landing distance uses the landing airfield's atmosphere and wind, and the crosswind check runs at each airfield: `crosswind` for the departure and `landingCrosswind` for the landing.

## Performance

A condition has `kind`. `"noData"` gives status `noData`. `"steps"` has `id`, `label`, `distanceUnit` (`m` or `ft`), an ordered list of `steps`, and optional `assumes`.

Either kind may have `surface`: `paved`, `grass`, `gravel` or `water`. It doesn't change the calculation. When the pilot picks a runway from the airfield list whose surface is of that kind, and no other condition in the same list has it, an app may choose the condition. It counts as the pilot's choice when every other condition in the list names another surface. When another condition has no `surface`, such as snow, the list can't rule it out, so the pilot confirms the choice. An airfield list's surface that names two kinds, such as `ASPH-TURF`, matches none.

Each chain holds two values, `total` and `groundRoll`, both starting empty. Steps run in order. A result stops at the first step that can't continue, with this status:

- **`needsInput`:** an input the step needs is missing.
- **`noResult`:** a value is outside what the manual covers and the rule says `none`.

Axes and steps are handled strictly in order, and the first one that can't continue decides the status. Status `ok` means every step ran. The mass used is the takeoff mass for takeoff and the landing mass for landing, always from mass and balance.

### Steps

**`lookup`** (`table`): reads the table's `axes` and `outputs`, setting `total` and `groundRoll` from whichever outputs the table has. Table cells are nested arrays in axis order.

Each axis has `name`, `input`, `unit`, rising `values`, and `below` and `above` rules. The input value, converted to the axis unit, is:

| `input` | Value | Missing when |
| --- | --- | --- |
| `pressureAltitude` | Pressure altitude | No elevation or QNH |
| `densityAltitude` | Density altitude | No elevation, QNH or OAT |
| `elevation` | Elevation | No elevation |
| `temperature` | OAT | No OAT |
| `mass` | The mass above | Never |

For each axis, in order, with input x:

- Below `values[0] − EPSILON`: apply `below`. Above the last value + `EPSILON`: apply `above`. `none` means `noResult`. `nearest` uses the end value. `nearestWarn` uses the end value and warns.
- Within `EPSILON` of a value: an exact match at that index, checked from the first value upward.
- Otherwise between two neighbours, with fraction `f = (x − low) ÷ (high − low)`.

Interpolate from the first axis inward. At each axis, an exact match or a nearest value uses only that index, **with no arithmetic**, so a printed cell comes back exactly. Otherwise, `value = low + (high − low) × f`, where low and high are the results of interpolating the remaining axes.

**`fixed`** (`total`, `groundRoll`, either or both): sets the values given.

**`factor`** (`value`, `applies`): multiplies the named values by `value`.

**`massCorrection`** (`referenceMass`, `exponent`, `applies`): multiplies the named values by `(mass ÷ referenceMass)^exponent`, whether the mass is below or above the reference.

**`wind`** (`headwind`, `tailwind`, either or both, plus `applies`): needs wind, otherwise `needsInput`. A rule has `mode`, `percent`, `perKnots`, optional `maxKnots`, and `above`.

- If headwind > `EPSILON` and a `headwind` rule exists, use knots = headwind and sign −1. If headwind < −`EPSILON` and a `tailwind` rule exists, use knots = −headwind and sign +1. Otherwise the factor is 1.
- If `maxKnots` exists and knots > `maxKnots + EPSILON`, apply the rule's `above`: `none` means `noResult`. `nearest` and `nearestWarn` use `maxKnots`, and `nearestWarn` warns.
- `proportional`: units = knots ÷ `perKnots`. `stepped`: units = floor(knots ÷ `perKnots` + `EPSILON`).
- factor = 1 + sign × `percent` × units ÷ 100. Multiply the values named in `applies`.

**`surface`** (`percent`, `carryToTotal`): added = `groundRoll × percent ÷ 100`. Then `groundRoll += added`, and if `carryToTotal`, `total += added`.

**`ratio`** (`from`, `into`, `value`): sets `into = from × value`.

### Rounding

Displayed distance = `ceil(raw − EPSILON)`, to a whole number in `distanceUnit`, separately for `total` and `groundRoll` from their unrounded values. A value never set stays empty.

A file is rejected before calculation if a step uses a value not yet set. `referenceMass` is in the aircraft's mass unit, and a table's values and `fixed` values are already in `distanceUnit`. Weighing mass is above zero, so CG is always defined.

### Warnings and notes

A result has warnings, cautions that need the pilot's extra care, and notes, information about what the distance doesn't account for. They are counted as follows, with no merging of identical ones.

Warnings:

- Each axis using `nearestWarn` adds one, as does each wind rule using it.
- An extension above a table adds one, and a second when it is more than `alertAboveM` above the table.

Notes:

- `assumes` (`text`, `inputs`) adds one when `inputs` is empty, or when any listed input is missing or differs from its `value` by more than `EPSILON` in its `unit`. The result is still shown.
- A chain with no `wind` step adds one, saying the wind was recorded and did not change the distance, unless an Operator wind rule applied.

### Operator Rules

The release index may hold `operatorRules`, the operator's own corrections. The app adds them to every aircraft in the release; an aircraft file never holds them. They apply only where the manual gives nothing, and their steps carry the source `operator`, shown as "Operator rule".

**`wind`** (`headwind?: { percent, perKnots }`, `tailwind?: { percent, perKnots, maxKnots? }`): for a chain with no `wind` step. After the last step, both `total` and `groundRoll` are multiplied as a proportional `wind` rule would, with `above: none` for `maxKnots`. With no `headwind`, a headwind gives no credit, and the working says so. Wind is then required, as for a `wind` step.

**`aboveTable`** (`takeoffPercentPer1000ft`, `landingPercentPer1000ft`, `alertAboveM`): for an axis whose input is `pressureAltitude`, `densityAltitude` or `elevation`, with `above: none` and at least two values, when the input is above the last value. Only the first such axis of a lookup is extended. The lookup reads the table at the last value, giving `D_top`, and at the one before it, giving `D_below`, with every other axis as usual. Each output is then multiplied by the larger of:

```
σ(h)    = (1 − h_ft / 145366.45)^(1 / 0.190284)       pressure altitude or elevation
σ(h)    = (1 − h_ft / 145442.16)^(1 / 0.234969)       density altitude
n       = ln(D_top / D_below) / ln(σ(h_below) / σ(h_top)),   or 0 unless D_top > D_below > 0
density = (σ(h_top) / σ(h))^n
rule    = (1 + percent / 100)^((h_ft − h_top_ft) / 1000)     percent for the phase
```

`density` carries the table's own trend with air density; `rule` is the operator's minimum (UK CAA Safety Sense Leaflet 09: 10% takeoff, 5% landing per 1000 ft). There is no upper limit.


## Data Releases

A Data Release is one published folder, read by the app from `/data/`:

```
index.json
releases/<release>/<registration>.json
```

`index.json` has `formatVersion`, `operator`, `release` (a whole number), `published`, optional `notes`, optional `operatorRules` (see Operator Rules), and `aircraft`. Each entry has `registration`, `type`, `revision`, optional `changes`, and either `file` and `sha256`, or `withdrawn: { reason }`.

`sha256` is the SHA-256, as lowercase hex, of the file's parsed JSON in RFC 8785 canonical form, so formatting doesn't affect it.

A device uses a release only if every file matches its checksum, passes validation and matches its entry's registration and revision. Releases are permanent. To undo one, republish an earlier version under a new number.

Use the command-line tool to check and publish hand-written files:

```sh
npm run data -- check my-aircraft/*.json
npm run data -- publish --source my-aircraft --out static/data --release 2 --operator "My club" --notes "New weighing"
```

To withdraw an aircraft, add `--withdraw "HB-XXX=Reason"` and leave its file in the source folder.

### Publish checks

Publishing fails, with no override, unless every file passes all of these:

- It is valid.
- Every hand-calculated case passes.
- Each selectable takeoff and landing condition with a table has a case between table values. In a fictional aircraft, it also has one exactly on a table value; a real aircraft's tables are compared with the manual instead. Others have at least one case. Conditions with the same `distanceUnit` and `steps` count as one, whatever their label or Configuration.
- At least two cases check CG, and at least one exceeds a limit.
- Any distance that shrinks as altitude, temperature or mass rises is listed in `acknowledgedUnusualValues`, using the checker's exact wording, after being compared with the manual.
- In a non-fictional aircraft, every table has `checked` (`by`, `date`, `fingerprint`): a person compared it with the manual. The fingerprint is FNV-1a 64-bit, as 16 hex digits, of the canonical JSON of `{ axes: [{ unit, values }], outputs }`. A table changed afterwards fails, and the message gives its current fingerprint. The admin area fills this in.

## Hand-calculated cases

Each case has `id`, `label`, `author`, `date`, `input` and `expected`. Compare displayed values exactly: mass and arm as text with `display` decimals, in `manualUnits` when the file has them and in `units` otherwise, distances as rounded numbers, and status as given. `expected.exceeded` lists every limit id exceeded by the inputs. Fields left out of `expected`, other than `exceeded`, aren't compared.
