/** Who counts as an admin. Separate from the login library, so the rule can be tested alone. */
export function allowedEmails(value: string | undefined): Set<string> {
	return new Set((value ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean));
}

/** Checked on every request, because removing someone from the list must take effect at once. */
export function isAdmin(user: { email?: string | null; emailVerified?: boolean | null } | null | undefined, allowed: Set<string>): boolean {
	return !!user?.email && user.emailVerified === true && allowed.has(user.email.trim().toLowerCase());
}

export type AuthConfig = { configured: boolean; missing: string[] };
export function authConfig(env: Record<string, string | undefined>): AuthConfig {
	const missing = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'BETTER_AUTH_SECRET', 'ADMIN_EMAILS'].filter((k) => !env[k]);
	return { configured: missing.length === 0, missing };
}

/** A login bypass for automated browser tests. It refuses to work on any real host. */
export function testAdminEmail(env: Record<string, string | undefined>): string | null {
	if (env.AOP_TEST_ADMIN !== 'insecure-test-only' || env.VERCEL || env.NETLIFY || env.CF_PAGES) return null;
	return 'test-admin@example.com';
}
