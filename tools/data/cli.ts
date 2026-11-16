// Checks and publishes hand-written aircraft files, with the same rules as the admin GUI.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { buildRelease } from '../../src/lib/data/build-release.ts';
import { parseRules, type OperatorRules } from '../../src/lib/aircraft/operator-rules.ts';
import { publishChecks } from '../../src/lib/data/publish-checks.ts';
import { parseIndex, type ReleaseIndex } from '../../src/lib/data/release.ts';

const USAGE = `Usage:
  data check [--rules <file.json>] <file.json>...
  data publish --source <dir> --out <dir> --release <n> --operator <name> [--notes <text>]
               [--rules <file.json>] [--withdraw <registration=reason>]...

--rules: Operator Rules, as a release's index.json or the rules alone. Checks then run
as publishing does. Publishing without it keeps the previous release's rules.`;

const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const jsonFiles = (dir: string) => readdirSync(dir).filter((f) => f.endsWith('.json')).sort();

/** Operator Rules from a release's index.json, or from a file holding only the rules. */
function readRules(path: string): OperatorRules | undefined {
	const data = read(path);
	const parsed = parseRules(data && typeof data === 'object' && 'aircraft' in data ? data.operatorRules : data);
	if (!parsed.ok) throw new Error(`${path}: ${parsed.problem}`);
	return parsed.rules;
}

function check(paths: string[], rules: OperatorRules | undefined): boolean {
	let ok = true;
	if (rules) console.log('With the Operator Rules given.');
	for (const path of paths) {
		const { problems, unusual, aircraft } = publishChecks(read(path), rules);
		console.log(`${problems.length ? 'FAIL' : 'OK  '} ${path}${aircraft ? ` (${aircraft.registration}, revision ${aircraft.revision})` : ''}`);
		problems.forEach((p) => console.log(`  - ${p}`));
		if (!problems.length && unusual.length) console.log(`  ${unusual.length} unusual values acknowledged`);
		if (problems.length) ok = false;
	}
	return ok;
}

async function publish(o: { source: string; out: string; release: number; operator: string; notes?: string; withdraw: string[]; rules?: OperatorRules }): Promise<boolean> {
	const indexPath = join(o.out, 'index.json');
	const previous: ReleaseIndex | null = existsSync(indexPath) ? parseIndex(read(indexPath)) : null;
	if (existsSync(join(o.out, 'releases', String(o.release)))) { console.error(`releases/${o.release} already exists. Releases are permanent.`); return false; }
	const withdraw = Object.fromEntries(o.withdraw.map((w) => {
		const i = w.indexOf('=');
		if (i < 1 || i === w.length - 1) throw new Error(`Use --withdraw REG=reason, not "${w}"`);
		return [w.slice(0, i), w.slice(i + 1)];
	}));
	const drafts = jsonFiles(o.source).map((file) => ({ name: file, data: read(join(o.source, file)) }));
	const operatorRules = o.rules ?? previous?.operatorRules;
	const built = await buildRelease({ drafts, previous, release: o.release, operator: o.operator, operatorRules, notes: o.notes, withdraw, now: Date.now() });
	if (!built.ok) {
		built.problems.forEach((p) => console.error(`  - ${p}`));
		console.error('Nothing was published.');
		return false;
	}
	for (const file of built.files) {
		mkdirSync(dirname(join(o.out, file.path)), { recursive: true });
		writeFileSync(join(o.out, file.path), `${JSON.stringify(file.data, null, '\t')}\n`);
	}
	writeFileSync(indexPath, `${JSON.stringify(built.index, null, '\t')}\n`);
	console.log(`Published release ${o.release}: ${built.index.aircraft.length} aircraft.`);
	built.changes.forEach((c) => console.log(`  ${c.registration}: ${c.text}`));
	return true;
}

const [command, ...rest] = process.argv.slice(2);
let success = false;
if (command === 'check') {
	const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: { rules: { type: 'string' } } });
	if (positionals.length) success = check(positionals, values.rules ? readRules(values.rules) : undefined);
	else console.error(USAGE);
} else if (command === 'publish') {
	const { values } = parseArgs({ args: rest, options: { source: { type: 'string' }, out: { type: 'string' }, release: { type: 'string' }, operator: { type: 'string' }, notes: { type: 'string' }, rules: { type: 'string' }, withdraw: { type: 'string', multiple: true } } });
	const release = Number(values.release);
	if (!values.source || !values.out || !values.operator || !Number.isInteger(release) || release < 1) console.error(USAGE);
	else success = await publish({ source: values.source, out: values.out, release, operator: values.operator, notes: values.notes, withdraw: values.withdraw ?? [], rules: values.rules ? readRules(values.rules) : undefined });
} else console.error(USAGE);
process.exit(success ? 0 : 1);
