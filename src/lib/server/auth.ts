/** Google sign-in through Better Auth, with no database. Loaded only once configured, so the app builds and runs without it. */
import { getRequestEvent } from '$app/server';
import { allowedEmails, authConfig, isAdmin, testAdminEmail } from './auth-rules.ts';

let instance: Promise<any> | null = null;

export function getAuth() {
	instance ??= (async () => {
		const { betterAuth } = await import('better-auth');
		const { sveltekitCookies } = await import('better-auth/svelte-kit');
		const env = process.env;
		return betterAuth({
			baseURL: env.BETTER_AUTH_URL,
			secret: env.BETTER_AUTH_SECRET,
			socialProviders: { google: { clientId: env.GOOGLE_CLIENT_ID!, clientSecret: env.GOOGLE_CLIENT_SECRET!, requireEmailVerification: true } } as never,
			session: { expiresIn: 8 * 3600, cookieCache: { enabled: true, maxAge: 8 * 3600, strategy: 'jwe', refreshCache: false } },
			account: { storeStateStrategy: 'cookie', storeAccountCookie: true },
			plugins: [sveltekitCookies(getRequestEvent)]
		});
	})();
	return instance;
}

export function authIsConfigured() {
	return authConfig(process.env).configured;
}

/** The signed-in admin's email, or null. The allow-list is read fresh each time. */
export async function currentAdmin(request: Request): Promise<string | null> {
	const test = testAdminEmail(process.env);
	if (test) return test;
	if (!authIsConfigured()) return null;
	const auth = await getAuth();
	const session = await auth.api.getSession({ headers: request.headers });
	return isAdmin(session?.user, allowedEmails(process.env.ADMIN_EMAILS)) ? session.user.email : null;
}
