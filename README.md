# Aero Open Performance

Open-source mass and balance and takeoff and landing performance for piston aircraft. It runs offline in the browser, with no app store. Any club, school or aircraft owner can deploy their own copy.

> **Pre-release, not for flight.** Results from any pre-release version must not be used for flight preparation. It currently offers only fictional demo aircraft with invented data.

## Status

The pilot flow, calculation engine, Reports and weather prefill work on fictional aircraft. An admin GUI comes next. The plan is in [docs/SPEC.md](docs/SPEC.md), the aircraft format and calculation rules are in [docs/FORMAT.md](docs/FORMAT.md), and the vocabulary is in [GLOSSARY.md](GLOSSARY.md).

## Develop

```sh
npm install
npm run dev
npm run build
npm run preview
```

## Your own aircraft

Aircraft are described entirely by data. See [docs/FORMAT.md](docs/FORMAT.md) for the format and publish checks. Your files go in your own copy's `static/data` folder, and should stay out of any public repository if they hold manual tables or weighing data.

The fictional aircraft in `aircraft-examples` show what a complete file looks like. `npm run data:demo` rebuilds the demo release from them.

## Weather (optional)

Set `CHECKWX_API_KEY` in your host's settings to let pilots prefill weather from a METAR. Without it, pilots enter weather by hand. Never commit a real key.

## Licence

[Apache-2.0](LICENSE). The software comes with no warranty. The pilot in command is always responsible for verifying every result.
