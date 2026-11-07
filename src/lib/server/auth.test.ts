import { describe, expect, it } from 'vitest';
import { SESSION_SECONDS, adminPassword, cleanName, createSession, passwordMatches, readSession } from './auth.ts';

const PASSWORD = 'a-long-test-password';
const NOW = Date.UTC(2026, 10, 6);

describe('admin password', () => {
	it('is off when missing or too short', () => {
		expect(adminPassword({})).toBeNull();
		expect(adminPassword({ ADMIN_PASSWORD: '' })).toBeNull();
		expect(adminPassword({ ADMIN_PASSWORD: '123456789012345' })).toBeNull();
		expect(adminPassword({ ADMIN_PASSWORD: PASSWORD })).toBe(PASSWORD);
	});
	it('only matches exactly', () => {
		expect(passwordMatches(PASSWORD, PASSWORD)).toBe(true);
		expect(passwordMatches(PASSWORD, `${PASSWORD} `)).toBe(false);
		expect(passwordMatches(PASSWORD, '')).toBe(false);
		expect(passwordMatches(PASSWORD, undefined)).toBe(false);
		expect(passwordMatches(PASSWORD, [PASSWORD])).toBe(false);
	});
});

describe('admin name', () => {
	it('is tidied, and required', () => {
		expect(cleanName('  Anna   Example ')).toBe('Anna Example');
		expect(cleanName('   ')).toBeNull();
		expect(cleanName(undefined)).toBeNull();
		expect(cleanName('x'.repeat(61))).toBeNull();
	});
});

describe('admin session', () => {
	const session = createSession(PASSWORD, 'Anna Example', NOW);

	it('gives back the name until it expires', () => {
		expect(readSession(PASSWORD, session, NOW)).toBe('Anna Example');
		expect(readSession(PASSWORD, session, NOW + SESSION_SECONDS * 1000 - 1)).toBe('Anna Example');
		expect(readSession(PASSWORD, session, NOW + SESSION_SECONDS * 1000)).toBeNull();
	});
	it('ends when the password changes', () => expect(readSession('another-long-password', session, NOW)).toBeNull());
	it('refuses a changed name or expiry', () => {
		const [, signature] = session.split('.');
		const forged = Buffer.from(JSON.stringify({ name: 'Mallory', expires: NOW + 1e12 })).toString('base64url');
		expect(readSession(PASSWORD, `${forged}.${signature}`, NOW)).toBeNull();
	});
	it('refuses malformed cookies', () => {
		for (const cookie of [undefined, '', 'x', 'x.', '.y', 'x.y', `${session}.extra`]) expect(readSession(PASSWORD, cookie, NOW)).toBeNull();
	});
});
