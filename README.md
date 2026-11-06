# Aero Open Performance

Open-source mass and balance and takeoff and landing performance for piston aircraft. It runs offline in the browser, with no app store. Any club, school or aircraft owner can deploy their own copy.

> **Pre-release, not for flight.** Results from any pre-release version must not be used for flight preparation. It currently offers only fictional demo aircraft with invented data.

## Status

The pilot flow, calculation engine, Reports and weather prefill work on fictional aircraft. The optional admin area is set up as described in [docs/ADMIN.md](docs/ADMIN.md). The plan is in [docs/SPEC.md](docs/SPEC.md), the aircraft format and calculation rules are in [docs/FORMAT.md](docs/FORMAT.md), and the vocabulary is in [GLOSSARY.md](GLOSSARY.md).

## Develop

```sh
npm install
npm run dev
npm run build
npm run preview
```

## Your own aircraft

Aircraft are described entirely by data. You can set them up in the [admin area](docs/ADMIN.md), or write files by hand using [docs/FORMAT.md](docs/FORMAT.md). Hand-written files go in your own copy's `static/data` folder. Keep manual tables and weighing data out of any public repository.

The fictional aircraft in `aircraft-examples` show what a complete file looks like. `npm run data:demo` rebuilds the demo release from them.

## Weather (optional)

Set `CHECKWX_API_KEY` in your host's settings to let pilots prefill weather from a METAR. Without it, pilots enter weather by hand. Never commit a real key.

## Licence

[Apache-2.0](LICENSE). The software comes with no warranty. The pilot in command is always responsible for verifying every result.
