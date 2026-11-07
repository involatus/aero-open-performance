/**
 * Builds a Data Release from aircraft drafts, with no override. The command-line tool
 * and the admin GUI both use this, so the same rules apply however data is published.
 */
import { FORMAT_VERSION } from '../aircraft/schema.ts';
import { sha256 } from './canonical.ts';
import { publishChecks, secondEntryDifferences } from './publish-checks.ts';
import { describeChanges, parseIndex, type Change, type ReleaseEntry, type ReleaseIndex } from './release.ts';

export type DraftInput = { name: string; data: unknown; secondEntry?: unknown };
export type ReleaseRequest = {
	drafts: DraftInput[];
	previous: ReleaseIndex | null;
	release: number;
	operator: string;
	notes?: string;
	withdraw?: Record<string, string>;
	/** Keeps every previously published aircraft that isn't in `drafts` or `withdraw`, unchanged. */
	carryOver?: boolean;
	now: number;
};
export type BuiltRelease =
	| { ok: true; index: ReleaseIndex; files: Array<{ path: string; data: unknown }>; changes: Change[] }
	| { ok: false; problems: string[] };

export function nextReleaseNumber(previous: ReleaseIndex | null) {
	return (previous?.release ?? 0) + 1;
}

export async function buildRelease(r: ReleaseRequest): Promise<BuiltRelease> {
	const problems: string[] = [];
	if (r.previous && r.release <= r.previous.release) problems.push(`Release ${r.release} must be newer than ${r.previous.release}. Releases are permanent: to undo one, republish an earlier version under a new number.`);
	if (!Number.isInteger(r.release) || r.release < 1) problems.push('The release number must be a whole number from 1.');
	if (!r.operator?.trim()) problems.push('The Operator name is missing.');

	const withdraw = r.withdraw ?? {};
	const entries: ReleaseEntry[] = [], files: Array<{ path: string; data: unknown }> = [];
	const dir = `releases/${r.release}`;
	const seen = new Set<string>();
	for (const draft of r.drafts) {
		const checks = publishChecks(draft.data);
		checks.problems.forEach((p) => problems.push(`${draft.name}: ${p}`));
		const a = checks.aircraft;
		if (!a) continue;
		if (seen.has(a.registration)) problems.push(`${draft.name}: ${a.registration} appears twice`);
		seen.add(a.registration);
		if (withdraw[a.registration]) continue;
		if (!a.fictional) {
			if (draft.secondEntry === undefined) problems.push(`${draft.name}: real aircraft need their tables entered twice`);
			else {
				const other = publishChecks(draft.secondEntry).aircraft;
				if (!other) problems.push(`${draft.name}: the second entry is not a valid aircraft file`);
				else secondEntryDifferences(a, other).forEach((d) => problems.push(`${draft.name}: second entry differs. ${d}`));
			}
		}
		const name = `${encodeURIComponent(a.registration)}.json`;
		entries.push({ registration: a.registration, type: a.type, revision: a.revision, file: `${dir}/${name}`, sha256: await sha256(draft.data) });
		files.push({ path: `${dir}/${name}`, data: draft.data });
	}
	for (const [registration, reason] of Object.entries(withdraw)) {
		if (!reason.trim()) { problems.push(`${registration}: withdrawing needs a reason`); continue; }
		const known = r.previous?.aircraft.find((e) => e.registration === registration);
		entries.push({ registration, type: known?.type ?? registration, revision: known?.revision ?? 1, withdrawn: { reason } });
	}
	if (r.carryOver) {
		// Aircraft not chosen this time stay exactly as pilots have them, including withdrawals.
		const handled = new Set(entries.map((e) => e.registration));
		for (const e of r.previous?.aircraft ?? []) if (!handled.has(e.registration) && !seen.has(e.registration)) entries.push({ ...e });
	}
	if (!entries.length) problems.push('A release needs at least one aircraft.');
	if (problems.length) return { ok: false, problems };

	const notes = r.notes?.trim();
	const index = parseIndex({ formatVersion: FORMAT_VERSION, operator: r.operator.trim(), release: r.release, published: new Date(r.now).toISOString(), ...(notes ? { notes } : {}), aircraft: entries });
	return { ok: true, index, files, changes: describeChanges(r.previous, index) };
}
