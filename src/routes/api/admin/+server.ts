/** One endpoint for the admin GUI. Every action needs a signed-in admin from this site. */
import { SESSION_COOKIE, SESSION_SECONDS, adminPassword, cleanName, createSession, passwordMatches, readSession } from '#lib/server/auth.ts';
import { storageFromEnv } from '#lib/server/storage/from-env.ts';
import { AdminError, checkDraft, deleteDraft, getDraft, getSettings, latestIndex, listDrafts, listReleases, publish, restoreRelease, saveDraft, saveSettings } from '#lib/server/admin.ts';
import { availableUpdate } from '#lib/server/updates.ts';
import { version } from '../../../../package.json';
import type { RequestHandler } from './$types';

export const prerender = false;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export const POST: RequestHandler = async ({ request, cookies, url }) => {
	// Blocks requests started by other websites using an admin's cookie.
	const site = request.headers.get('sec-fetch-site');
	if (site && site !== 'same-origin') return json({ error: 'Not allowed from another site.' }, 403);

	const body = (await request.json().catch(() => null)) as any;
	if (!body?.action) return json({ error: 'No action given.' }, 400);

	const storage = await storageFromEnv();
	const password = adminPassword(process.env);
	const admin = password ? readSession(password, cookies.get(SESSION_COOKIE), Date.now()) : null;
	if (body.action === 'status') {
		const configured = !!password && !!storage;
		return json({ configured, signedIn: configured && !!admin, name: configured ? admin : null, storage: storage?.kind ?? null });
	}
	if (!password || !storage) return json({ error: 'The admin area isn\'t set up on this deployment.' }, 501);
	if (body.action === 'signIn') {
		const name = cleanName(body.name);
		if (!name) return json({ error: 'Enter your name.' }, 400);
		if (!passwordMatches(password, body.password)) return json({ error: 'That password isn\'t right.' }, 401);
		cookies.set(SESSION_COOKIE, createSession(password, name, Date.now()), { path: '/api/admin', httpOnly: true, sameSite: 'strict', secure: url.protocol === 'https:', maxAge: SESSION_SECONDS });
		return json({ ok: true });
	}
	if (body.action === 'signOut') {
		cookies.delete(SESSION_COOKIE, { path: '/api/admin' });
		return json({ ok: true });
	}
	if (!admin) return json({ error: 'Please sign in.' }, 401);

	const now = Date.now();
	try {
		switch (body.action) {
			case 'overview': return json({ drafts: await listDrafts(storage), settings: await getSettings(storage), index: await latestIndex(storage), releases: await listReleases(storage), version, updateAvailable: await availableUpdate(version) });
			case 'getDraft': return json(await getDraft(storage, body.id));
			case 'saveDraft': return json(await saveDraft(storage, body.id, body, admin, now));
			case 'deleteDraft': await deleteDraft(storage, body.id); return json({ ok: true });
			case 'check': return json(checkDraft(body.aircraft));
			case 'saveSettings': return json(await saveSettings(storage, body.settings));
			case 'publish': return json(await publish(storage, body, admin, now));
			case 'restore': return json(await restoreRelease(storage, body.release, body.registration, admin, now));
			default: return json({ error: 'Unknown action.' }, 400);
		}
	} catch (error) {
		if (error instanceof AdminError) return json({ error: error.message }, error.status);
		console.error('Admin action failed', body.action, error);
		return json({ error: 'That didn\'t work. Nothing was changed that you can\'t retry.' }, 500);
	}
};
