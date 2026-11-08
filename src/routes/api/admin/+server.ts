/** One endpoint for the admin GUI. The rules live in handleAdminRequest; this only adapts HTTP and the cookie. */
import { SESSION_COOKIE, SESSION_SECONDS, adminPassword } from '#lib/server/auth.ts';
import { handleAdminRequest } from '#lib/server/admin-requests.ts';
import { storageFromEnv } from '#lib/server/storage/from-env.ts';
import { availableUpdate } from '#lib/server/updates.ts';
import { version } from '../../../../package.json';
import type { RequestHandler } from './$types';

export const prerender = false;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export const POST: RequestHandler = async ({ request, cookies, url }) => {
	// Blocks requests started by other websites using an admin's cookie.
	const site = request.headers.get('sec-fetch-site');
	if (site && site !== 'same-origin') return json({ error: 'Not allowed from another site.' }, 403);

	const reply = await handleAdminRequest(await request.json().catch(() => null), {
		storage: await storageFromEnv(),
		password: adminPassword(process.env),
		sessionCookie: cookies.get(SESSION_COOKIE),
		now: Date.now(),
		version,
		updateAvailable: availableUpdate
	});
	const cookie = { path: '/api/admin', httpOnly: true, sameSite: 'strict', secure: url.protocol === 'https:' } as const;
	if (reply.session && 'set' in reply.session) cookies.set(SESSION_COOKIE, reply.session.set, { ...cookie, maxAge: SESSION_SECONDS });
	if (reply.session && 'clear' in reply.session) cookies.delete(SESSION_COOKIE, cookie);
	return json(reply.body, reply.status);
};
