import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { canonicalize, sha256 } from './canonical.ts';
import { coverageProblems, publishChecks, unusualValues } from './publish-checks.ts';
import { tableCheckProblems, tableCheckState, tableFingerprint } from './table-check.ts';
import { ReleaseError, describeChanges, downloadRelease, isStale, parseIndex, shouldCheck, verifyAircraft, verifyInstalled, withdrawalReason, type ReleaseIndex } from './release.ts';
import { validateAircraft } from '../aircraft/validate.ts';
import type { Aircraft } from '../aircraft/schema.ts';

const raw = (name: string) => JSON.parse(readFileSync(`aircraft-examples/${name}.json`, 'utf8'));
const aircraft = (name: string): Aircraft => { const r = validateAircraft(raw(name)); if (!r.ok) throw new Error(r.problems.join()); return r.aircraft; };
const NAMES = readdirSync('aircraft-examples').map((f) => f.replace('.json', ''));
const DAY = 86400000;
async function indexFor(data: any, over: Partial<ReleaseIndex> = {}): Promise<ReleaseIndex> {
	return { formatVersion: '0.1.0', operator: 'Test', release: 1, published: '2026-11-06T00:00:00Z', aircraft: [{ registration: data.registration, type: data.type, revision: data.revision, file: 'releases/1/x.json', sha256: await sha256(data) }], ...over };
}

describe('checksums', () => {
	it('matches RFC 8785 ordering and number rules', () => {
		expect(canonicalize({ b: 1, a: [true, null, 'x'], '€': 1, '\r': 2 })).toBe('{"\\r":2,"a":[true,null,"x"],"b":1,"€":1}');
		expect(canonicalize({ n: 1e30, m: 0.000001, o: 1.0, p: -0 })).toBe('{"m":0.000001,"n":1e+30,"o":1,"p":0}');
		expect(() => canonicalize(Infinity)).toThrow();
	});
	it('ignores formatting and key order, but not values', async () => {
		expect(await sha256({ a: 1, b: 2 })).toBe(await sha256(JSON.parse('{ "b": 2,\n"a": 1.0 }')));
		expect(await sha256({ a: 1 })).not.toBe(await sha256({ a: 1.0000001 }));
	});
	it('matches the known SHA-256 of a fixed text', async () => {
		const expected = execFileSync('python3', ['-I', '-c', 'import hashlib;print(hashlib.sha256(b\'"abc"\').hexdigest())'], { encoding: 'utf8' }).trim();
		expect(await sha256('abc')).toBe(expected);
	});
	it('round-trips any JSON value', () => {
		fc.assert(fc.property(fc.jsonValue(), (value) => {
			const safe = JSON.parse(JSON.stringify(value));
			expect(canonicalize(JSON.parse(canonicalize(safe)))).toBe(canonicalize(safe));
		}));
	});
});

describe('installing a release', () => {
	const data = raw('test-dr-style');
	it('accepts a matching file', async () => {
		const index = await indexFor(data);
		const installed = await downloadRelease(index, async () => data, 5);
		expect(installed.aircraft[0].registration).toBe('TEST-DR');
		expect(await verifyInstalled(installed)).toBe(true);
	});
	it('refuses a changed value, even by one digit', async () => {
		const index = await indexFor(data), tampered = structuredClone(data);
		tampered.tables.hard.outputs.total[0][0] = 401;
		await expect(verifyAircraft(index.aircraft[0], tampered)).rejects.toThrow(ReleaseError);
		await expect(downloadRelease(index, async () => tampered, 5)).rejects.toThrow('checksum');
	});
	it('installs nothing if any file fails', async () => {
		const other = raw('test-kitfox-style');
		const index = await indexFor(data);
		index.aircraft.push((await indexFor(other)).aircraft[0]);
		let calls = 0;
		await expect(downloadRelease(index, async () => { if (calls++) throw new Error('network'); return data; }, 5)).rejects.toThrow('network');
	});
	it('refuses a valid file with the wrong identity', async () => {
		const copy = structuredClone(data); copy.revision = 2;
		const index = await indexFor(copy); index.aircraft[0].revision = 1;
		await expect(verifyAircraft(index.aircraft[0], copy)).rejects.toThrow('does not match');
	});
	it('refuses a matching checksum on an invalid file', async () => {
		const copy = structuredClone(data); copy.surprise = 1;
		const index = await indexFor(copy);
		await expect(verifyAircraft(index.aircraft[0], copy)).rejects.toThrow('not valid');
	});
	it('refuses data newer than the app understands, and says what to do', async () => {
		expect(() => parseIndex({ formatVersion: '0.2.0', operator: 'T', release: 1, published: 'x', aircraft: [] })).toThrow('newer version of the app');
		expect(() => parseIndex({ formatVersion: '1.0.0', operator: 'T', release: 1, published: 'x', aircraft: [] })).toThrow();
	});
	it('refuses an index with unsafe file paths', async () => {
		const index = await indexFor(data);
		for (const file of ['../../evil.json', 'https://evil.example/x.json', 'releases/1/../../x.json']) {
			expect(() => parseIndex({ ...index, aircraft: [{ ...index.aircraft[0], file }] })).toThrow();
		}
	});
	it('notices a damaged stored copy', async () => {
		const index = await indexFor(data), installed = await downloadRelease(index, async () => data, 5);
		const damaged = structuredClone(installed);
		(damaged.aircraft[0].tables.hard.outputs.total as number[][])[0][0] = 1;
		expect(await verifyInstalled(damaged)).toBe(false);
		expect(await verifyInstalled({ ...installed, aircraft: [] })).toBe(false);
		expect(await verifyInstalled(null)).toBe(false);
		expect(await verifyInstalled(undefined)).toBe(false);
	});
});

describe('updates', () => {
	it('checks at most hourly unless asked', () => {
		expect(shouldCheck(null, 1000)).toBe(true);
		expect(shouldCheck(1000, 1000 + 3599999)).toBe(false);
		expect(shouldCheck(1000, 1000 + 3600000)).toBe(true);
		expect(shouldCheck(1000, 1001, true)).toBe(true);
	});
	it('warns after 30 days without a check', () => {
		expect(isStale(0, 30 * DAY)).toBe(false);
		expect(isStale(0, 30 * DAY + 1)).toBe(true);
	});
	const entry = (registration: string, revision: number, more = {}) => ({ registration, type: 'T', revision, file: `releases/1/${registration}.json`, sha256: 'a'.repeat(64), ...more });
	const index = (release: number, aircraft: any[]): ReleaseIndex => ({ formatVersion: '0.1.0', operator: 'O', release, published: 'x', aircraft });
	it('describes what changed, in words', () => {
		const before = index(1, [entry('A', 1), entry('B', 1), entry('C', 1), entry('D', 1)]);
		const after = index(2, [entry('A', 1), entry('B', 2, { changes: 'New weighing' }), { registration: 'C', type: 'T', revision: 1, withdrawn: { reason: 'Data error' } }, entry('E', 1)]);
		expect(describeChanges(before, after)).toEqual([
			{ registration: 'B', text: 'New weighing' }, { registration: 'C', text: 'Withdrawn: Data error' }, { registration: 'E', text: 'New aircraft' }, { registration: 'D', text: 'Removed from the data' }
		]);
	});
	it('applies a withdrawal as soon as it is seen, before install', () => {
		const installed = index(1, [entry('A', 1)]);
		const seen = index(2, [{ registration: 'A', type: 'T', revision: 1, withdrawn: { reason: 'Data error' } }]);
		expect(withdrawalReason(installed, null, 'A')).toBeNull();
		expect(withdrawalReason(installed, seen, 'A')).toBe('Data error');
		expect(withdrawalReason(seen, installed, 'A')).toBe('Data error');
	});
});

describe('publish checks', () => {
	it.each(NAMES)('%s passes everything', (n) => expect(publishChecks(raw(n)).problems).toEqual([]));
	it('fails a wrong hand-calculated result', () => {
		const d = raw('test-dr-style');
		d.handCases[0].expected.takeoff.total += 1;
		expect(publishChecks(d).problems.join()).toContain('dr-on-table');
	});
	it('fails when a condition has no case on a table value or between values', () => {
		const a = aircraft('test-kitfox-style');
		expect(coverageProblems({ ...a, handCases: [] }).join()).toContain('exactly on a table value');
		expect(coverageProblems({ ...a, handCases: [] }).join()).toContain('between table values');
		expect(coverageProblems({ ...a, handCases: [] }).join()).toContain('exceeds a limit');
		expect(coverageProblems({ ...a, handCases: [] }).join()).toContain('one forward and one aft');
	});
	it('flags a distance that shrinks with temperature or altitude, until acknowledged', () => {
		const d = raw('test-dr-style');
		d.tables.hard.outputs.total[1][1] = 300;
		const parsed = validateAircraft(d);
		if (!parsed.ok) throw new Error('invalid');
		const found = unusualValues(parsed.aircraft);
		expect(found.length).toBeGreaterThan(0);
		d.handCases = [];
		expect(publishChecks(d).problems.join()).toContain('Unusual value not acknowledged');
		d.acknowledgedUnusualValues = found;
		expect(publishChecks(d).problems.join()).not.toContain('Unusual value not acknowledged');
	});
	it('reports no unusual values on tidy tables', () => { for (const n of NAMES) expect(unusualValues(aircraft(n))).toEqual([]); });
	it('needs every table of a real aircraft compared with the manual, and unchanged since', () => {
		const a = aircraft('test-dr-style');
		expect(tableCheckProblems(a)).toEqual([]);
		a.fictional = false;
		expect(tableCheckProblems(a).join()).toContain('Table hard: not yet compared');
		for (const t of Object.values(a.tables)) t.checked = { by: 'Anna', date: '2026-11-08', fingerprint: tableFingerprint(t) };
		expect(tableCheckProblems(a)).toEqual([]);
		(a.tables.hard.outputs.total as number[][])[1][2] = 531;
		expect(tableCheckState(a.tables.hard)).toEqual({ status: 'changed', by: 'Anna', date: '2026-11-08' });
		expect(tableCheckProblems(a)).toEqual([expect.stringContaining('Table hard: changed after Anna compared it')]);
	});
	it('fingerprints values and units, not formatting or axis names', () => {
		const t = aircraft('test-dr-style').tables.hard, f = tableFingerprint(t);
		expect(f).toMatch(/^[0-9a-f]{16}$/);
		expect(tableFingerprint(JSON.parse(JSON.stringify(t)))).toBe(f);
		expect(tableFingerprint({ ...t, axes: t.axes.map((x) => ({ ...x, name: 'Renamed' })) })).toBe(f);
		expect(tableFingerprint({ ...t, axes: t.axes.map((x, i) => (i === 0 ? { ...x, unit: x.unit === 'ft' ? 'm' : 'ft' } : x)) })).not.toBe(f);
	});
});

describe('command-line tool', () => {
	const work = mkdtempSync(join(tmpdir(), 'data-cli-'));
	afterAll(() => rmSync(work, { recursive: true, force: true }));
	const run = (...args: string[]) => spawnSync('node', ['--no-warnings', 'tools/data/cli.ts', ...args], { encoding: 'utf8' });
	const source = join(work, 'source'), out = join(work, 'out');
	const publish = (release: number, ...more: string[]) => run('publish', '--source', source, '--out', out, '--release', String(release), '--operator', 'Test', ...more);
	cpSync('aircraft-examples', source, { recursive: true });

	it('checks files, and exits non-zero on failure', () => {
		expect(run('check', `aircraft-examples/test-dr-style.json`).status).toBe(0);
		const bad = join(work, 'bad.json'), d = raw('test-dr-style');
		d.handCases[0].expected.takeoff.total += 1;
		writeFileSync(bad, JSON.stringify(d));
		const r = run('check', bad);
		expect(r.status).toBe(1);
		expect(r.stdout).toContain('dr-on-table');
	});
	it('publishes a release that the app accepts', async () => {
		expect(publish(1).status).toBe(0);
		const index = parseIndex(JSON.parse(readFileSync(join(out, 'index.json'), 'utf8')));
		const installed = await downloadRelease(index, async (f) => JSON.parse(readFileSync(join(out, f), 'utf8')), 1);
		expect(installed.aircraft).toHaveLength(4);
		expect(await verifyInstalled(installed)).toBe(true);
	});
	it('refuses to overwrite or reuse a release number', () => {
		const r = publish(1);
		expect(r.status).toBe(1);
		expect(r.stderr).toContain('permanent');
	});
	it('publishes a withdrawal with its reason', async () => {
		expect(publish(2, '--withdraw', 'TEST-KF=Data error found').status).toBe(0);
		const index = parseIndex(JSON.parse(readFileSync(join(out, 'index.json'), 'utf8')));
		expect(index.aircraft.find((e) => e.registration === 'TEST-KF')?.withdrawn?.reason).toBe('Data error found');
		const installed = await downloadRelease(index, async (f) => JSON.parse(readFileSync(join(out, f), 'utf8')), 1);
		expect(installed.aircraft).toHaveLength(3);
		expect(await verifyInstalled(installed)).toBe(true);
	});
	it('publishes nothing if one file fails', () => {
		const d = raw('test-dr-style');
		d.handCases[0].expected.takeoff.total += 1;
		writeFileSync(join(source, 'test-dr-style.json'), JSON.stringify(d));
		const r = publish(3);
		expect(r.status).toBe(1);
		expect(r.stderr).toContain('Nothing was published');
		expect(readdirSync(join(out, 'releases')).sort()).toEqual(['1', '2']);
		cpSync('aircraft-examples/test-dr-style.json', join(source, 'test-dr-style.json'));
	});
	it('requires every table of a real aircraft to be compared with the manual', () => {
		const d = raw('test-dr-style');
		d.fictional = false;
		writeFileSync(join(source, 'test-dr-style.json'), JSON.stringify(d));
		const r = publish(3);
		expect(r.status).toBe(1);
		expect(r.stderr).toContain('not yet compared with the manual');
	});
});
