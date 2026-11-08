# Aero Open Performance

Open-source mass and balance and takeoff and landing performance for piston aircraft. It runs offline in the browser, with no app store. Each club, school or aircraft owner uses their own copy, which they can deploy themselves or have someone set up for them.

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

## Set up a copy for a club

Each club gets its own Vercel project and its own storage, all built from this repository. The club doesn't need a Git or Vercel account.

1. In Vercel, choose **Add New**, then **Project**, and import this repository under a name for the club. A push to the repository then updates this copy too.
2. In the new project, open **Storage**, create a **Blob** store with **Private** access, and connect it. Never reuse another club's store.
3. Create a password with `openssl rand -base64 24`, and add it as `ADMIN_PASSWORD` in the project's environment variables. Add `CHECKWX_API_KEY` too if the club wants weather.
4. Redeploy, then send the club its address and password. They sign in at `/admin`.

Vercel's Hobby plan is limited to non-commercial, personal use, so check that it fits. See [docs/ADMIN.md](docs/ADMIN.md) for managing the password and publishing.

## Your own aircraft

Aircraft are described entirely by data. You can set them up in the [admin area](docs/ADMIN.md), or write files by hand using [docs/FORMAT.md](docs/FORMAT.md). Hand-written files go in your own copy's `static/data` folder. Keep manual tables and weighing data out of any public repository.

The fictional aircraft in `aircraft-examples` show what a complete file looks like. `npm run data:demo` rebuilds the demo release from them.

## Airfields

The app keeps a list of about 29,000 airfields with their runways from [OurAirports](https://ourairports.com/data/), which is public domain, so it works offline. Finding an airfield prefills its elevation and lets the pilot choose a runway. Pilots confirm each value, and can always type them by hand. Refresh the list with `npm run airports`; the app shows its date.

## Weather (optional)

Set `CHECKWX_API_KEY` in your host's settings to let pilots prefill weather from a METAR. Without it, pilots enter weather by hand. Never commit a real key.

## Licence

[Apache-2.0](LICENSE). The software comes with no warranty. The pilot in command is always responsible for verifying every result.
