/**
 * Every admin request, from sign-in to publishing, as one module the route only adapts to HTTP.
 * Storage, password, session and clock come in from outside, so the whole flow is testable.
 */
import { AdminError, deleteDraft, getDraft, getSettings, latestIndex, listDrafts, listReleases, publish, restoreRelease, saveDraft, saveSettings } from './admin.ts';
import { cleanName, createSession, passwordMatches, readSession } from './auth.ts';
import type { Storage } from './storage/index.ts';

export type AdminContext = {
	storage: Storage | null;
	password: string | null;
	sessionCookie: string | undefined;
	now: number;
	version: string;
	updateAvailable: (version: string) => Promise<string | null>;
};
export type AdminReply = { status: number; body: unknown; session?: { set: string } | { clear: true } };
export type AdminStatus = { configured: boolean; signedIn: boolean; name: string | null; storage: string | null };

async function overview(s: Storage, ctx: AdminContext) {
	return { drafts: await listDrafts(s), settings: await getSettings(s), index: await latestIndex(s), releases: await listReleases(s), version: ctx.version, updateAvailable: await ctx.updateAvailable(ctx.version) };
}
export type Overview = Awaited<ReturnType<typeof overview>>;

const reply = (body: unknown, status = 200): AdminReply => ({ status, body });

export async function handleAdminRequest(body: any, ctx: AdminContext): Promise<AdminReply> {
	if (!body?.action) return reply({ error: 'No action given.' }, 400);
	const { storage: s, password } = ctx;
	const admin = password ? readSession(password, ctx.sessionCookie, ctx.now) : null;
	if (body.action === 'status') {
		const configured = !!password && !!s;
		return reply({ configured, signedIn: configured && !!admin, name: configured ? admin : null, storage: s?.kind ?? null } satisfies AdminStatus);
	}
	if (!password || !s) return reply({ error: 'The admin area isn\'t set up on this deployment.' }, 501);
	if (body.action === 'signIn') {
		const name = cleanName(body.name);
		if (!name) return reply({ error: 'Enter your name.' }, 400);
		if (!passwordMatches(password, body.password)) return reply({ error: 'That password isn\'t right.' }, 401);
		return { status: 200, body: { ok: true }, session: { set: createSession(password, name, ctx.now) } };
	}
	if (body.action === 'signOut') return { status: 200, body: { ok: true }, session: { clear: true } };
	if (!admin) return reply({ error: 'Please sign in.' }, 401);

	try {
		switch (body.action) {
			case 'overview': return reply(await overview(s, ctx));
			case 'getDraft': return reply(await getDraft(s, body.id));
			case 'saveDraft': return reply(await saveDraft(s, body.id, body, admin, ctx.now));
			case 'deleteDraft': await deleteDraft(s, body.id); return reply({ ok: true });
			case 'saveSettings': return reply(await saveSettings(s, body.settings));
			case 'publish': return reply(await publish(s, body, admin, ctx.now));
			case 'restore': return reply(await restoreRelease(s, body.release, body.registration, admin, ctx.now));
			default: return reply({ error: 'Unknown action.' }, 400);
		}
	} catch (error) {
		if (error instanceof AdminError) return reply({ error: error.message }, error.status);
		console.error('Admin action failed', body.action, error);
		return reply({ error: 'That didn\'t work. Nothing was changed that you can\'t retry.' }, 500);
	}
}
