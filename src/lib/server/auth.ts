/** One admin password per copy, set in the host's settings. Pilots never sign in. */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'aop_admin';
export const SESSION_SECONDS = 8 * 3600;
const MIN_PASSWORD_LENGTH = 16;

/** A short password counts as not set up, so a guessable one can't protect the admin area. */
export function adminPassword(env: Record<string, string | undefined>): string | null {
	const password = env.ADMIN_PASSWORD;
	return password && password.length >= MIN_PASSWORD_LENGTH ? password : null;
}

const hash = (value: string) => createHash('sha256').update(value).digest();

export function passwordMatches(password: string, attempt: unknown): boolean {
	return typeof attempt === 'string' && timingSafeEqual(hash(password), hash(attempt));
}

/** The name recorded on changes. It's typed by the admin, so it isn't proof of identity. */
export function cleanName(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const name = value.replace(/\s+/g, ' ').trim();
	return name && name.length <= 60 ? name : null;
}

const sign = (password: string, payload: string) => createHmac('sha256', password).update(payload).digest('base64url');

/** Signed with the password, so changing the password signs everyone out. */
export function createSession(password: string, name: string, now: number): string {
	const payload = Buffer.from(JSON.stringify({ name, expires: now + SESSION_SECONDS * 1000 })).toString('base64url');
	return `${payload}.${sign(password, payload)}`;
}

/** The signed-in admin's name, or null. */
export function readSession(password: string, cookie: string | undefined, now: number): string | null {
	const [payload, signature, ...rest] = (cookie ?? '').split('.');
	if (!payload || !signature || rest.length) return null;
	if (!timingSafeEqual(hash(sign(password, payload)), hash(signature))) return null;
	const { name, expires } = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { name: string; expires: number };
	return now < expires ? name : null;
}
