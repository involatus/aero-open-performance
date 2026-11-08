/** What the admin GUI can do. Separate from the framework, so every rule can be tested. */
import { formatIsReadable } from '../aircraft/validate.ts';
import { buildRelease, nextReleaseNumber, type DraftInput } from '../data/build-release.ts';
import { publishChecks, unusualValues } from '../data/publish-checks.ts';
import { parseIndex, type ReleaseIndex } from '../data/release.ts';
import { validateAircraft } from '../aircraft/validate.ts';
import { AlreadyExists, VersionConflict, type Storage } from './storage/index.ts';

export type Draft = { aircraft: unknown; updatedBy: string; updatedAt: string };
export type Settings = { operator: string };
export class AdminError extends Error {
	constructor(public status: number, message: string) { super(message); }
}

const INDEX = 'published/index.json';
const SETTINGS = 'settings.json';
const draftPath = (id: string) => {
	if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(id)) throw new AdminError(400, 'That aircraft name can only use letters, numbers, dots, dashes and underscores.');
	return `drafts/${id}.json`;
};

export async function getSettings(s: Storage): Promise<Settings> {
	return (await s.get<Settings>(SETTINGS))?.data ?? { operator: '' };
}
export async function saveSettings(s: Storage, settings: Settings) {
	const operator = String(settings?.operator ?? '').trim();
	if (!operator) throw new AdminError(400, 'Enter the Operator name.');
	await s.put(SETTINGS, { operator });
	return { operator };
}

export async function latestIndex(s: Storage): Promise<ReleaseIndex | null> {
	const stored = await s.get(INDEX);
	return stored ? parseIndex(stored.data) : null;
}

export async function listDrafts(s: Storage) {
	const paths = await s.list('drafts/');
	const out = [];
	for (const path of paths) {
		const stored = await s.get<Draft>(path);
		if (!stored) continue;
		const a = stored.data.aircraft as { registration?: string; type?: string; revision?: number } | null;
		out.push({ id: path.slice('drafts/'.length, -'.json'.length), registration: a?.registration ?? '', type: a?.type ?? '', revision: a?.revision ?? null, updatedBy: stored.data.updatedBy, updatedAt: stored.data.updatedAt });
	}
	return out;
}

export async function getDraft(s: Storage, id: string) {
	const stored = await s.get<Draft>(draftPath(id));
	if (!stored) throw new AdminError(404, 'That draft does not exist.');
	return stored;
}

/** A second person's save can't silently replace a first: `version` must still match. */
export async function saveDraft(s: Storage, id: string, body: { aircraft: unknown; version?: string | null }, admin: string, now: number) {
	if (body?.aircraft === undefined) throw new AdminError(400, 'The draft has no aircraft.');
	const draft: Draft = { aircraft: body.aircraft, updatedBy: admin, updatedAt: new Date(now).toISOString() };
	try {
		return { version: await s.put(draftPath(id), draft, { ifVersion: body.version === undefined ? null : body.version }) };
	} catch (error) {
		if (error instanceof VersionConflict) throw new AdminError(409, 'Someone else changed this draft. Reload it before saving, so their changes aren\'t lost.');
		if (error instanceof AlreadyExists) throw new AdminError(409, 'A draft with that name already exists.');
		throw error;
	}
}

export async function deleteDraft(s: Storage, id: string) {
	await s.remove(draftPath(id));
}

/** The same checks as publishing, for showing what is still missing. */
export function checkDraft(aircraft: unknown) {
	const { problems, unusual } = publishChecks(aircraft);
	return { problems, unusual, ok: problems.length === 0 };
}

export { unusualValues, validateAircraft };

/**
 * Publishing a chosen set of drafts: aircraft already published but not chosen carry over unchanged,
 * and an aircraft only leaves pilots' devices by being withdrawn with a reason.
 * Publishing writes every aircraft file first and the index last. Pilots only ever follow
 * the index, so a failure part-way leaves the previous release in force.
 */
export async function publish(s: Storage, request: { notes?: string; withdraw?: Record<string, string>; include?: string[] }, admin: string, now: number) {
	const previous = await s.get(INDEX);
	const previousIndex = previous ? parseIndex(previous.data) : null;
	const settings = await getSettings(s);
	const drafts: DraftInput[] = [];
	for (const path of await s.list('drafts/')) {
		const stored = await s.get<Draft>(path);
		const name = path.slice('drafts/'.length, -'.json'.length);
		// Only the chosen drafts are checked and published. Without a choice, all of them are.
		if (Array.isArray(request?.include) && !request.include.includes(name)) continue;
		if (stored) drafts.push({ name, data: stored.data.aircraft });
	}
	const release = nextReleaseNumber(previousIndex);
	const built = await buildRelease({ drafts, previous: previousIndex, release, operator: settings.operator, notes: request?.notes, withdraw: request?.withdraw, carryOver: true, now });
	if (!built.ok) return built;
	for (const file of built.files) await s.put(`published/${file.path}`, file.data, { ifVersion: null });
	try {
		await s.put(INDEX, built.index, { ifVersion: previous?.version ?? null });
	} catch (error) {
		if (error instanceof VersionConflict || error instanceof AlreadyExists) throw new AdminError(409, 'Someone else published at the same time. Nothing changed for pilots. Try again.');
		throw error;
	}
	await s.put(`history/${release}.json`, { release, publishedBy: admin, published: built.index.published, changes: built.changes, notes: built.index.notes ?? null });
	return { ok: true as const, release, changes: built.changes, index: built.index };
}

export async function listReleases(s: Storage) {
	const out = [];
	for (const path of await s.list('history/')) {
		const stored = await s.get<{ release: number; publishedBy: string; published: string; changes: unknown[]; notes: string | null }>(path);
		if (stored) out.push(stored.data);
	}
	return out.sort((a, b) => b.release - a.release);
}

/** Undo: turns a published file back into a draft, to republish under a new number. */
export async function restoreRelease(s: Storage, release: number, registration: string, admin: string, now: number) {
	const name = `${encodeURIComponent(registration)}.json`;
	const stored = await s.get(`published/releases/${Number(release)}/${name}`);
	if (!stored) throw new AdminError(404, 'That release does not hold this aircraft.');
	const id = registration.replace(/[^A-Za-z0-9._-]/g, '-');
	const current = await s.get<Draft>(draftPath(id));
	return saveDraft(s, id, { aircraft: stored.data, version: current?.version ?? null }, admin, now);
}

/** Public read for pilots' devices. Only the published folder is reachable. */
export async function publishedFile(s: Storage, path: string) {
	if (path !== 'index.json' && !/^releases\/\d+\/[A-Za-z0-9._%-]+\.json$/.test(path)) return null;
	return s.get(`published/${path}`);
}

export { formatIsReadable };
