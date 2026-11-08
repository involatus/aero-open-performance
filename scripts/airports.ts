// Writes static/airports.json from OurAirports (public domain), compact enough to keep offline.
// Run `npm run airports` to refresh it. The app shows the date, and pilots confirm every value it fills in.
import { writeFileSync } from 'node:fs';

const BASE = 'https://davidmegginson.github.io/ourairports-data';
const KINDS = new Set(['small_airport', 'medium_airport', 'large_airport']);

/** A small CSV reader: quoted fields may hold commas and doubled quotes. */
function parseCsv(text: string): Record<string, string>[] {
	const rows: string[][] = [];
	let row: string[] = [], field = '', quoted = false;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (quoted) {
			if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
			else if (ch === '"') quoted = false;
			else field += ch;
		} else if (ch === '"') quoted = true;
		else if (ch === ',') { row.push(field); field = ''; }
		else if (ch === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
		else field += ch;
	}
	if (field || row.length) { row.push(field); rows.push(row); }
	const [head, ...body] = rows;
	return body.filter((r) => r.length === head.length).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

const get = async (name: string) => parseCsv(await (await fetch(`${BASE}/${name}.csv`)).text());
const [airports, runways] = await Promise.all([get('airports'), get('runways')]);

const byAirport = new Map<string, Record<string, string>[]>();
for (const r of runways) {
	if (r.closed === '1') continue;
	byAirport.set(r.airport_ref, [...(byAirport.get(r.airport_ref) ?? []), r]);
}
const num = (s: string) => (s === '' ? null : Math.round(Number(s)));
const list = airports
	.filter((a) => KINDS.has(a.type) && byAirport.has(a.id))
	.map((a) => [a.ident, a.name, num(a.elevation_ft), Number(Number(a.latitude_deg).toFixed(3)), Number(Number(a.longitude_deg).toFixed(3)),
		byAirport.get(a.id)!.map((r) => [r.le_ident, r.he_ident, r.surface, num(r.length_ft)])]);

writeFileSync('static/airports.json', JSON.stringify({ source: 'OurAirports, public domain', date: new Date().toISOString().slice(0, 10), airports: list }));
console.log(`Wrote ${list.length} airfields to static/airports.json`);
