import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { downloadRelease, verifyInstalled } from '../data/release.ts';
import { AdminError, checkDraft, deleteDraft, getDraft, latestIndex, listDrafts, listReleases, publish, publishedFile, restoreRelease, saveDraft, saveSettings } from './admin.ts';
import { fileStorage } from './storage/file.ts';
import { AlreadyExists, VersionConflict, memoryStorage, type Storage } from './storage/index.ts';

const raw = (name: string) => JSON.parse(readFileSync(`aircraft-examples/${name}.json`, 'utf8'));
const NOW = Date.UTC(2026, 10, 6);
const ADMIN = 'admin@example.com';
const work = mkdtempSync(join(tmpdir(), 'aop-storage-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));

describe.each([['memory', () => memoryStorage()], ['file', () => fileStorage(join(work, String(Math.random())))]] as Array<[string, () => Storage]>)('%s storage', (_n, make) => {
	let s: Storage;
	beforeEach(() => { s = make(); });
	it('stores and lists', async () => {
		await s.put('a/1.json', { x: 1 });
		await s.put('a/2.json', { x: 2 });
		await s.put('b/1.json', { x: 3 });
		expect(await s.list('a/')).toEqual(['a/1.json', 'a/2.json']);
		expect((await s.get('a/2.json'))?.data).toEqual({ x: 2 });
		expect(await s.get('missing.json')).toBeNull();
		await s.remove('a/1.json');
		expect(await s.list('a/')).toEqual(['a/2.json']);
	});
	it('refuses to overwrite when asked', async () => {
		await s.put('a.json', 1, { ifVersion: null });
		await expect(s.put('a.json', 2, { ifVersion: null })).rejects.toThrow(AlreadyExists);
	});
	it('refuses a stale version', async () => {
		const v1 = await s.put('a.json', 1);
		const v2 = await s.put('a.json', 2, { ifVersion: v1 });
		await expect(s.put('a.json', 3, { ifVersion: v1 })).rejects.toThrow(VersionConflict);
		await s.put('a.json', 3, { ifVersion: v2 });
		await expect(s.put('new.json', 3, { ifVersion: 'x' })).rejects.toThrow(VersionConflict);
	});
});

it('file storage cannot escape its folder', async () => {
	const s = fileStorage(join(work, 'jail'));
	await expect(s.put('../outside.json', 1)).rejects.toThrow('outside');
});

describe('drafts', () => {
	let s: Storage;
	beforeEach(() => { s = memoryStorage(); });
	it('creates, lists and records who changed it', async () => {
		await saveDraft(s, 'TEST-DR', { aircraft: raw('test-dr-style') }, ADMIN, NOW);
		expect((await listDrafts(s))[0]).toMatchObject({ id: 'TEST-DR', registration: 'TEST-DR', updatedBy: ADMIN });
	});
	it('keeps an unfinished draft', async () => {
		await saveDraft(s, 'NEW', { aircraft: { registration: 'HB-XXX' } }, ADMIN, NOW);
		expect((await getDraft(s, 'NEW')).data.aircraft).toEqual({ registration: 'HB-XXX' });
		expect(checkDraft({ registration: 'HB-XXX' }).ok).toBe(false);
	});
	it('stops two people overwriting each other', async () => {
		const { version } = await saveDraft(s, 'A', { aircraft: {} }, ADMIN, NOW);
		await saveDraft(s, 'A', { aircraft: { a: 1 }, version }, 'first@example.com', NOW);
		await expect(saveDraft(s, 'A', { aircraft: { a: 2 }, version }, 'second@example.com', NOW)).rejects.toMatchObject({ status: 409 });
		expect((await getDraft(s, 'A')).data.aircraft).toEqual({ a: 1 });
	});
	it('won\'t replace an existing draft when creating', async () => {
		await saveDraft(s, 'A', { aircraft: {} }, ADMIN, NOW);
		await expect(saveDraft(s, 'A', { aircraft: {} }, ADMIN, NOW)).rejects.toThrow('already exists');
	});
	it('rejects unsafe names', async () => {
		for (const id of ['../x', 'a/b', '', '.hidden']) await expect(saveDraft(s, id, { aircraft: {} }, ADMIN, NOW)).rejects.toThrow(AdminError);
	});
});

describe('publishing', () => {
	let s: Storage;
	beforeEach(async () => {
		s = memoryStorage();
		await saveSettings(s, { operator: 'Test club' });
		await saveDraft(s, 'TEST-KF', { aircraft: raw('test-kitfox-style') }, ADMIN, NOW);
	});
	it('publishes a release pilots\' devices accept', async () => {
		const r = await publish(s, { notes: 'First' }, ADMIN, NOW);
		expect(r.ok).toBe(true);
		const index = await latestIndex(s);
		expect(index?.release).toBe(1);
		expect(index?.operator).toBe('Test club');
		const installed = await downloadRelease(index!, async (f) => (await publishedFile(s, f))!.data, NOW);
		expect(await verifyInstalled(installed)).toBe(true);
		expect((await listReleases(s))[0]).toMatchObject({ release: 1, publishedBy: ADMIN });
	});
	it('has no way past a failing check, and leaves pilots on the old release', async () => {
		await publish(s, {}, ADMIN, NOW);
		const bad = raw('test-kitfox-style');
		bad.handCases[0].expected.takeoff.total += 1;
		const { version } = await getDraft(s, 'TEST-KF');
		await saveDraft(s, 'TEST-KF', { aircraft: bad, version }, ADMIN, NOW);
		const r = await publish(s, { force: true } as never, ADMIN, NOW);
		expect(r.ok).toBe(false);
		expect((await latestIndex(s))?.release).toBe(1);
		expect(await s.list('published/releases/2')).toEqual([]);
	});
	it('needs the Operator name', async () => {
		const empty = memoryStorage();
		await saveDraft(empty, 'TEST-KF', { aircraft: raw('test-kitfox-style') }, ADMIN, NOW);
		const r = await publish(empty, {}, ADMIN, NOW);
		expect(r.ok).toBe(false);
		await expect(saveSettings(empty, { operator: ' ' })).rejects.toThrow('Operator');
	});
	it('real aircraft need a matching second entry', async () => {
		const real = raw('test-kitfox-style'); real.fictional = false;
		const { version } = await getDraft(s, 'TEST-KF');
		const saved = await saveDraft(s, 'TEST-KF', { aircraft: real, version }, ADMIN, NOW);
		const none = await publish(s, {}, ADMIN, NOW);
		expect(none.ok).toBe(false);
		if (!none.ok) expect(none.problems.join()).toContain('entered twice');
		const typo = structuredClone(real); typo.tables.takeoff.outputs.total[0][0] += 1;
		const second = await saveDraft(s, 'TEST-KF', { aircraft: real, secondEntry: typo, version: saved.version }, ADMIN, NOW);
		const differs = await publish(s, {}, ADMIN, NOW);
		if (!differs.ok) expect(differs.problems.join()).toContain('total[0][0]');
		else throw new Error('should not publish');
		await saveDraft(s, 'TEST-KF', { aircraft: real, secondEntry: structuredClone(real), version: second.version }, ADMIN, NOW);
		expect((await publish(s, {}, ADMIN, NOW)).ok).toBe(true);
	});
	it('numbers releases upward and never overwrites one', async () => {
		await publish(s, {}, ADMIN, NOW);
		const first = await s.get('published/releases/1/TEST-KF.json');
		await publish(s, {}, ADMIN, NOW + 1);
		expect((await latestIndex(s))?.release).toBe(2);
		expect((await s.get('published/releases/1/TEST-KF.json'))?.version).toBe(first?.version);
	});
	it('withdraws an aircraft with a required reason', async () => {
		await publish(s, {}, ADMIN, NOW);
		const noReason = await publish(s, { withdraw: { 'TEST-KF': ' ' } }, ADMIN, NOW);
		expect(noReason.ok).toBe(false);
		expect((await publish(s, { withdraw: { 'TEST-KF': 'Data error' } }, ADMIN, NOW)).ok).toBe(true);
		expect((await latestIndex(s))?.aircraft[0].withdrawn?.reason).toBe('Data error');
	});
	it('undoes by republishing an earlier version under a new number', async () => {
		await publish(s, {}, ADMIN, NOW);
		const changed = raw('test-kitfox-style'); changed.revision = 2;
		const { version } = await getDraft(s, 'TEST-KF');
		await saveDraft(s, 'TEST-KF', { aircraft: changed, version }, ADMIN, NOW);
		await publish(s, {}, ADMIN, NOW);
		await restoreRelease(s, 1, 'TEST-KF', ADMIN, NOW);
		expect((await publish(s, {}, ADMIN, NOW)).ok).toBe(true);
		const index = await latestIndex(s);
		expect(index?.release).toBe(3);
		expect(index?.aircraft[0].revision).toBe(1);
	});
	it('leaves pilots on the old release if writing fails part-way', async () => {
		await publish(s, {}, ADMIN, NOW);
		const { version } = await getDraft(s, 'TEST-KF');
		await saveDraft(s, 'TEST-KF', { aircraft: { ...raw('test-kitfox-style'), revision: 2 }, version }, ADMIN, NOW);
		const failing: Storage = { ...s, put: async (path, data, o) => { if (path === 'published/index.json') throw new Error('storage down'); return s.put(path, data, o); } };
		await expect(publish(failing, {}, ADMIN, NOW)).rejects.toThrow('storage down');
		expect((await latestIndex(s))?.release).toBe(1);
	});
	it('exposes only published files to the public route', async () => {
		await publish(s, {}, ADMIN, NOW);
		expect(await publishedFile(s, 'index.json')).not.toBeNull();
		expect(await publishedFile(s, 'releases/1/TEST-KF.json')).not.toBeNull();
		for (const path of ['../settings.json', 'settings.json', '../drafts/TEST-KF.json', 'releases/1/../../../drafts/TEST-KF.json', 'history/1.json']) expect(await publishedFile(s, path)).toBeNull();
	});
	it('removes a draft without touching what was published', async () => {
		await publish(s, {}, ADMIN, NOW);
		await deleteDraft(s, 'TEST-KF');
		expect(await listDrafts(s)).toEqual([]);
		expect(await publishedFile(s, 'releases/1/TEST-KF.json')).not.toBeNull();
	});
});
