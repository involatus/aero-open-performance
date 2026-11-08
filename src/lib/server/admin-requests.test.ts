import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { handleAdminRequest, type AdminContext } from './admin-requests.ts';
import { memoryStorage } from './storage/index.ts';

const PASSWORD = 'a-long-test-password';
const NOW = Date.UTC(2026, 10, 8);
const context = (over: Partial<AdminContext> = {}): AdminContext => ({ storage: memoryStorage(), password: PASSWORD, sessionCookie: undefined, now: NOW, version: '0.2.0', updateAvailable: async () => null, ...over });

async function signedIn(over: Partial<AdminContext> = {}) {
	const ctx = context(over);
	const r = await handleAdminRequest({ action: 'signIn', name: 'Anna', password: PASSWORD }, ctx);
	return { ...ctx, sessionCookie: (r.session as { set: string }).set };
}

describe('admin requests', () => {
	it('say when the admin area isn\'t set up, without refusing the status question', async () => {
		expect((await handleAdminRequest({ action: 'status' }, context({ password: null }))).body).toMatchObject({ configured: false, signedIn: false });
		expect((await handleAdminRequest({ action: 'overview' }, context({ storage: null }))).status).toBe(501);
		expect((await handleAdminRequest(null, context())).status).toBe(400);
	});
	it('sign in only with the right password and a name, and sign out', async () => {
		expect((await handleAdminRequest({ action: 'signIn', name: 'Anna', password: 'wrong' }, context())).status).toBe(401);
		expect((await handleAdminRequest({ action: 'signIn', name: ' ', password: PASSWORD }, context())).status).toBe(400);
		const ctx = await signedIn();
		expect((await handleAdminRequest({ action: 'status' }, ctx)).body).toMatchObject({ signedIn: true, name: 'Anna' });
		expect((await handleAdminRequest({ action: 'signOut' }, ctx)).session).toEqual({ clear: true });
	});
	it('refuse every other action without a session, and an expired one', async () => {
		for (const action of ['overview', 'getDraft', 'saveDraft', 'deleteDraft', 'saveSettings', 'publish', 'restore']) expect((await handleAdminRequest({ action }, context())).status).toBe(401);
		const ctx = await signedIn();
		expect((await handleAdminRequest({ action: 'overview' }, { ...ctx, now: NOW + 9 * 3600 * 1000 })).status).toBe(401);
	});
	it('records the signed-in name on drafts, and turns storage conflicts into messages', async () => {
		const ctx = await signedIn();
		const aircraft = JSON.parse(readFileSync('aircraft-examples/test-kitfox-style.json', 'utf8'));
		expect((await handleAdminRequest({ action: 'saveDraft', id: 'TEST-KF', aircraft }, ctx)).status).toBe(200);
		const overview = (await handleAdminRequest({ action: 'overview' }, ctx)).body as { drafts: { updatedBy: string }[]; version: string };
		expect(overview.drafts[0].updatedBy).toBe('Anna');
		expect(overview.version).toBe('0.2.0');
		const stale = await handleAdminRequest({ action: 'saveDraft', id: 'TEST-KF', aircraft, version: 'old' }, ctx);
		expect(stale.status).toBe(409);
		expect((await handleAdminRequest({ action: 'nonsense' }, ctx)).status).toBe(400);
	});
});
