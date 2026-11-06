// Checks and publishes hand-written aircraft files, with the same rules as the admin GUI.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { FORMAT_VERSION } from '../../src/lib/aircraft/schema.ts';
import { sha256 } from '../../src/lib/data/canonical.ts';
import { publishChecks, secondEntryDifferences } from '../../src/lib/data/publish-checks.ts';
import { describeChanges, parseIndex, type ReleaseEntry, type ReleaseIndex } from '../../src/lib/data/release.ts';

const USAGE = `Usage:
  data check <file.json>...
  data publish --source <dir> --out <dir> --release <n> --operator <name> [--notes <text>]
               [--second-entry <dir>] [--withdraw <registration=reason>]...`;

const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const jsonFiles = (dir: string) => readdirSync(dir).filter((f) => f.endsWith('.json')).sort();

function check(paths: string[]): boolean {
	let ok = true;
	for (const path of paths) {
		const { problems, unusual, aircraft } = publishChecks(read(path));
		console.log(`${problems.length ? 'FAIL' : 'OK  '} ${path}${aircraft ? ` (${aircraft.registration}, revision ${aircraft.revision})` : ''}`);
		problems.forEach((p) => console.log(`  - ${p}`));
		if (!problems.length && unusual.length) console.log(`  ${unusual.length} unusual values acknowledged`);
		if (problems.length) ok = false;
	}
	return ok;
}

async function publish(o: { source: string; out: string; release: number; operator: string; notes?: string; secondEntry?: string; withdraw: string[] }): Promise<boolean> {
	const indexPath = join(o.out, 'index.json');
	const previous: ReleaseIndex | null = existsSync(indexPath) ? parseIndex(read(indexPath)) : null;
	if (previous && o.release <= previous.release) { console.error(`Release ${o.release} must be newer than ${previous.release}. Releases are permanent: to undo one, republish an earlier version under a new number.`); return false; }
	const dir = join('releases', String(o.release));
	if (existsSync(join(o.out, dir))) { console.error(`${dir} already exists. Releases are permanent.`); return false; }

	const withdrawals = new Map(o.withdraw.map((w) => { const i = w.indexOf('='); if (i < 1 || i === w.length - 1) throw new Error(`Use --withdraw REG=reason, not "${w}"`); return [w.slice(0, i), w.slice(i + 1)]; }));
	const files = jsonFiles(o.source), entries: ReleaseEntry[] = [], outputs: Array<[string, unknown]> = [];
	let ok = true;
	for (const file of files) {
		const data = read(join(o.source, file));
		const { problems, aircraft } = publishChecks(data);
		if (problems.length || !aircraft) { console.error(`FAIL ${file}`); problems.forEach((p) => console.error(`  - ${p}`)); ok = false; continue; }
		if (withdrawals.has(aircraft.registration)) continue;
		if (!aircraft.fictional) {
			const second = o.secondEntry && join(o.secondEntry, file);
			if (!second || !existsSync(second)) { console.error(`FAIL ${file}: real aircraft need their tables entered twice. Pass --second-entry with a matching file.`); ok = false; continue; }
			const other = publishChecks(read(second)).aircraft;
			const differences = other ? secondEntryDifferences(aircraft, other) : ['The second entry is not a valid aircraft file'];
			if (differences.length) { console.error(`FAIL ${file}: the second entry differs. Check these against the manual:`); differences.forEach((d) => console.error(`  - ${d}`)); ok = false; continue; }
		}
		const name = `${encodeURIComponent(aircraft.registration)}.json`;
		entries.push({ registration: aircraft.registration, type: aircraft.type, revision: aircraft.revision, file: `${dir}/${name}`, sha256: await sha256(data) });
		outputs.push([name, data]);
	}
	if (!ok) { console.error('Nothing was published.'); return false; }
	for (const [registration, reason] of withdrawals) {
		const known = previous?.aircraft.find((e) => e.registration === registration);
		entries.push({ registration, type: known?.type ?? registration, revision: known?.revision ?? 1, withdrawn: { reason } });
	}
	const index: ReleaseIndex = { formatVersion: FORMAT_VERSION, operator: o.operator, release: o.release, published: new Date().toISOString(), ...(o.notes ? { notes: o.notes } : {}), aircraft: entries };
	parseIndex(index);
	mkdirSync(join(o.out, dir), { recursive: true });
	for (const [name, data] of outputs) writeFileSync(join(o.out, dir, name), `${JSON.stringify(data, null, '\t')}\n`);
	writeFileSync(indexPath, `${JSON.stringify(index, null, '\t')}\n`);
	console.log(`Published release ${o.release}: ${entries.length} aircraft.`);
	describeChanges(previous, index).forEach((c) => console.log(`  ${c.registration}: ${c.text}`));
	return true;
}

const [command, ...rest] = process.argv.slice(2);
let success = false;
if (command === 'check' && rest.length) success = check(rest);
else if (command === 'publish') {
	const { values } = parseArgs({ args: rest, options: { source: { type: 'string' }, out: { type: 'string' }, release: { type: 'string' }, operator: { type: 'string' }, notes: { type: 'string' }, 'second-entry': { type: 'string' }, withdraw: { type: 'string', multiple: true } } });
	const release = Number(values.release);
	if (!values.source || !values.out || !values.operator || !Number.isInteger(release) || release < 1) console.error(USAGE);
	else success = await publish({ source: values.source, out: values.out, release, operator: values.operator, notes: values.notes, secondEntry: values['second-entry'], withdraw: values.withdraw ?? [] });
} else console.error(USAGE);
process.exit(success ? 0 : 1);
