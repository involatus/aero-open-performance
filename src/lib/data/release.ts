/** Data Releases: how a device reads, checks and installs published aircraft data. */
import * as v from 'valibot';
import { FORMAT_VERSION, type Aircraft } from '../aircraft/schema.ts';
import { formatIsReadable, validateAircraft } from '../aircraft/validate.ts';
import { sha256 } from './canonical.ts';

const Text = v.pipe(v.string(), v.minLength(1));
const Entry = v.strictObject({
	registration: Text,
	type: Text,
	revision: v.pipe(v.number(), v.integer(), v.minValue(1)),
	file: v.optional(v.pipe(Text, v.regex(/^releases\/\d+\/[A-Za-z0-9._%-]+\.json$/))),
	sha256: v.optional(v.pipe(Text, v.regex(/^[0-9a-f]{64}$/))),
	withdrawn: v.optional(v.strictObject({ reason: Text })),
	changes: v.optional(Text)
});
export const ReleaseIndex = v.strictObject({
	formatVersion: Text,
	operator: Text,
	release: v.pipe(v.number(), v.integer(), v.minValue(1)),
	published: Text,
	notes: v.optional(Text),
	aircraft: v.array(Entry)
});
export type ReleaseIndex = v.InferOutput<typeof ReleaseIndex>;
export type ReleaseEntry = v.InferOutput<typeof Entry>;
export type InstalledData = { index: ReleaseIndex; aircraft: Aircraft[]; installedAt: number };

export const CHECK_INTERVAL_MS = 3600000;
export const STALE_DAYS = 30;

export class ReleaseError extends Error {}

export function parseIndex(data: unknown): ReleaseIndex {
	const r = v.safeParse(ReleaseIndex, data);
	if (!r.success) throw new ReleaseError('The release index is not valid');
	if (!formatIsReadable(r.output.formatVersion)) throw new ReleaseError(`This data needs a newer version of the app (format ${r.output.formatVersion}, app supports ${FORMAT_VERSION})`);
	for (const e of r.output.aircraft) {
		if (!e.withdrawn && (!e.file || !e.sha256)) throw new ReleaseError(`The release index is missing the file for ${e.registration}`);
	}
	return r.output;
}

/** Checks one downloaded file against its index entry. Anything wrong throws, so nothing partial is ever used. */
export async function verifyAircraft(entry: ReleaseEntry, data: unknown): Promise<Aircraft> {
	if ((await sha256(data)) !== entry.sha256) throw new ReleaseError(`The file for ${entry.registration} does not match its checksum`);
	const result = validateAircraft(data);
	if (!result.ok) throw new ReleaseError(`The file for ${entry.registration} is not valid: ${result.problems[0]}`);
	const a = result.aircraft;
	if (a.registration !== entry.registration || a.revision !== entry.revision) throw new ReleaseError(`The file for ${entry.registration} does not match the release index`);
	return a;
}

/** Downloads a whole release and returns it only if every file checks out. */
export async function downloadRelease(index: ReleaseIndex, getJson: (file: string) => Promise<unknown>, now: number): Promise<InstalledData> {
	const aircraft: Aircraft[] = [];
	for (const entry of index.aircraft.filter((e) => !e.withdrawn)) aircraft.push(await verifyAircraft(entry, await getJson(entry.file!)));
	return { index, aircraft, installedAt: now };
}

/** Rechecks a stored release, so a damaged or evicted copy is refused. */
export async function verifyInstalled(data: InstalledData | undefined | null): Promise<boolean> {
	if (!data?.index || !Array.isArray(data.aircraft)) return false;
	try {
		const index = parseIndex(data.index);
		const live = index.aircraft.filter((e) => !e.withdrawn);
		if (live.length !== data.aircraft.length) return false;
		for (const entry of live) {
			const a = data.aircraft.find((x) => x.registration === entry.registration);
			if (!a) return false;
			await verifyAircraft(entry, a);
		}
		return true;
	} catch {
		return false;
	}
}

export function shouldCheck(lastCheck: number | null, now: number, force = false): boolean {
	return force || lastCheck === null || now - lastCheck >= CHECK_INTERVAL_MS;
}

export function isStale(lastCheck: number | null, now: number): boolean {
	return lastCheck !== null && now - lastCheck > STALE_DAYS * 86400000;
}

export type Change = { registration: string; text: string };

/** What a newer release changes for this device, in words. */
export function describeChanges(installed: ReleaseIndex | null, next: ReleaseIndex): Change[] {
	const before = new Map((installed?.aircraft ?? []).map((e) => [e.registration, e]));
	const changes: Change[] = [];
	for (const e of next.aircraft) {
		const old = before.get(e.registration);
		if (e.withdrawn) { if (!old?.withdrawn) changes.push({ registration: e.registration, text: `Withdrawn: ${e.withdrawn.reason}` }); }
		else if (!old) changes.push({ registration: e.registration, text: e.changes ?? 'New aircraft' });
		else if (old.withdrawn) changes.push({ registration: e.registration, text: e.changes ?? 'Available again' });
		else if (old.revision !== e.revision || old.sha256 !== e.sha256) changes.push({ registration: e.registration, text: e.changes ?? `Revision ${old.revision} to ${e.revision}` });
		before.delete(e.registration);
	}
	for (const registration of before.keys()) changes.push({ registration, text: 'Removed from the data' });
	return changes;
}

/** A withdrawal counts as soon as the device sees it, without waiting for Install. */
export function withdrawalReason(installed: ReleaseIndex | null, seen: ReleaseIndex | null, registration: string): string | null {
	for (const index of [seen, installed]) {
		const reason = index?.aircraft.find((e) => e.registration === registration)?.withdrawn?.reason;
		if (reason) return reason;
	}
	return null;
}
