import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const AIRCRAFT = ['TEST-DR', 'TEST-SR', 'TEST-GL', 'TEST-KF'];

async function failOnErrors(page: Page) {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
	return errors;
}
async function type(page: Page, id: string, value: string) {
	await page.locator(`[id="f-${id}"]`).click();
	for (const key of value) await page.locator('.keys button', { hasText: new RegExp(`^${key === '.' ? '\\.' : key}$`) }).click();
}

for (const name of AIRCRAFT) {
	test(`${name}: every step opens without an error`, async ({ page }) => {
		const errors = await failOnErrors(page);
		await page.goto('/');
		await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
		for (const step of ['2. Fuel', '3. Conditions', '4. Send', '1. Load']) {
			await page.locator('.steps button', { hasText: step }).click();
			await expect(page.locator('.steps [aria-current=step]')).toContainText(step);
		}
		await page.getByRole('button', { name: 'Show the working' }).click();
		await expect(page.locator('.strip')).toBeVisible();
		await expect(page.locator('svg')).toBeVisible();
		expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
		expect(errors).toEqual([]);
	});
}

test('full flow: confirm, block on a limit, next flight, and keep it after a reload', async ({ page }) => {
	const errors = await failOnErrors(page);
	await page.goto('/');
	await page.getByRole('button', { name: /^TEST-DR/ }).click();
	await type(page, 'load:pilot', '80');
	await page.locator('.keys button', { hasText: 'Next field' }).click();

	await page.locator('.steps button', { hasText: '2. Fuel' }).click();
	await expect(page.locator('[id="w-flow"]')).toContainText('From aircraft data');
	await page.getByRole('button', { name: 'Confirm' }).click();
	await type(page, 'fuel:front', '20');
	await type(page, 'fuel:rear', '20');
	await type(page, 'time', '1');
	await page.locator('.keys button', { hasText: 'Next field' }).click();

	await page.locator('.steps button', { hasText: '3. Conditions' }).click();
	for (const [id, value] of [['elev', '500'], ['rwy', '9'], ['qnh', '1013'], ['oat', '15'], ['wdir', '90'], ['wspd', '5']]) await type(page, id, value);
	await page.locator('.keys button', { hasText: 'Done' }).click();

	await page.locator('.steps button', { hasText: '4. Send' }).click();
	await page.locator('#f-place').fill('LSXX');
	await page.locator('#f-name').fill('A Pilot');
	await page.getByRole('checkbox').click();
	await expect(page.locator('.strip .status')).toHaveText('All checked');

	await page.locator('.steps button', { hasText: '1. Load' }).click();
	await type(page, 'load:rear', '101');
	await expect(page.locator('.strip .status')).toHaveText('1 limit over');
	await page.getByRole('button', { name: 'None' }).nth(2).click();
	await expect(page.locator('.strip .status')).toHaveText('All checked');

	await page.getByRole('button', { name: '+ Next flight' }).click();
	await expect(page.getByRole('tab')).toHaveCount(2);
	await expect(page.locator('[id="w-fuel:front"]')).toContainText('From previous flight');
	await expect(page.locator('[id="f-fuel:front"]')).toHaveValue('8');

	// Saving is asynchronous: wait until the store holds both tabs, which also proves it was written.
	await expect.poll(() => page.evaluate(() => new Promise((done) => {
		const open = indexedDB.open('keyval-store');
		open.onsuccess = () => {
			const get = open.result.transaction('keyval').objectStore('keyval').get('calculations-v1');
			get.onsuccess = () => done(get.result?.tabs?.length ?? 0);
		};
	}))).toBe(2);
	await page.reload();
	await expect(page.getByRole('tab')).toHaveCount(2);
	await expect(page.getByRole('tab').first()).toContainText('TEST-DR LSXX');
	expect(errors).toEqual([]);
});

test('tabs close with ×, and the start page can check for new data', async ({ page }) => {
	const errors = await failOnErrors(page);
	await page.goto('/');
	await page.getByRole('button', { name: /^TEST-DR/ }).click();
	await page.getByRole('button', { name: '+ New' }).click();
	await page.getByRole('button', { name: /^TEST-KF/ }).click();
	await expect(page.getByRole('tab')).toHaveCount(2);
	await page.getByRole('button', { name: /^Close .*TEST-KF/ }).click();
	await expect(page.getByRole('tab')).toHaveCount(1);
	await expect(page.getByRole('tab', { selected: true })).toContainText('TEST-DR');
	await page.getByRole('button', { name: /^Close / }).click();
	await expect(page.getByRole('heading', { name: 'Choose an aircraft' })).toBeVisible();
	await page.getByRole('button', { name: 'Check for new data' }).click();
	await expect(page.getByText('This is the latest data.')).toBeVisible();
	expect(errors).toEqual([]);
});

test('airfield list: find offline, choose a runway, confirm; unknown fields are typed by hand', async ({ page, context }) => {
	const errors = await failOnErrors(page);
	await page.goto('/');
	await page.waitForFunction(async () => (await navigator.serviceWorker.ready).active?.state === 'activated');
	await page.reload();
	await page.getByRole('button', { name: /^TEST-GL/ }).click();
	await page.locator('.steps button', { hasText: '3. Conditions' }).click();
	await context.setOffline(true);
	await page.getByLabel('Departure airfield').fill('LSZF');
	await page.getByRole('button', { name: 'Find' }).click();
	await expect(page.getByText('LSZF Birrfeld Airfield, 1300 ft')).toBeVisible();
	await expect(page.locator('[id="f-elev"]')).toHaveValue('396');
	await page.getByRole('button', { name: /^08R · grass/ }).click();
	await expect(page.locator('[id="f-rwy"]')).toHaveValue('08');
	await expect(page.getByText('Runway 08, heading 080°')).toBeVisible();
	await expect(page.getByText('Runway 08R surface in the airfield list: GRASS')).toBeVisible();
	await expect(page.locator('#w-rwy .chip')).toContainText('From airfield list LSZF');
	await page.getByLabel('Departure airfield').fill('Nowhere strip');
	await page.getByRole('button', { name: 'Find' }).click();
	await expect(page.getByText('Not in the airfield list. Enter the elevation and runway by hand.')).toBeVisible();
	await context.setOffline(false);
	expect(errors).toEqual([]);
});

test('starts with no connection', async ({ page, context }) => {
	await page.goto('/');
	await page.evaluate(() => navigator.serviceWorker.ready);
	await page.reload();
	await context.setOffline(true);
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Choose an aircraft' })).toBeVisible();
	await context.setOffline(false);
});

test('report: created, shared, permanent, and stale after a change', async ({ page }) => {
	const errors = await failOnErrors(page);
	await page.addInitScript(() => {
		const w = window as unknown as { shared: { name: string; type: string; head: string; size: number; b64: string }[] };
		w.shared = [];
		navigator.canShare = () => true;
		navigator.share = async (data) => {
			const file = (data as { files: File[] }).files[0];
			const bytes = new Uint8Array(await file.arrayBuffer());
			let binary = '';
			bytes.forEach((b) => { binary += String.fromCharCode(b); });
			w.shared.push({ name: file.name, type: file.type, head: binary.slice(0, 5), size: file.size, b64: btoa(binary) });
		};
	});
	await page.goto('/');
	await page.getByRole('button', { name: /^TEST-DR/ }).click();
	await type(page, 'load:pilot', '80');
	await page.locator('.keys button', { hasText: 'Next field' }).click();
	await page.locator('.steps button', { hasText: '2. Fuel' }).click();
	await page.getByRole('button', { name: 'Confirm' }).click();
	await type(page, 'fuel:front', '20');
	await type(page, 'fuel:rear', '20');
	await type(page, 'time', '1');
	await page.locator('.keys button', { hasText: 'Next field' }).click();
	await page.locator('.steps button', { hasText: '3. Conditions' }).click();
	for (const [id, value] of [['elev', '500'], ['rwy', '9'], ['qnh', '1013'], ['oat', '15'], ['wdir', '90'], ['wspd', '5']]) await type(page, id, value);
	await page.locator('.keys button', { hasText: 'Done' }).click();
	await page.locator('.steps button', { hasText: '4. Send' }).click();
	await expect(page.getByRole('button', { name: 'Create report' })).toBeDisabled();
	await page.locator('#f-place').fill('LSXX');
	await page.locator('#f-name').fill('A Pilot');
	await page.getByRole('checkbox').click();

	await page.getByRole('button', { name: 'Create report' }).click();
	await expect(page.locator('.banner')).toContainText('Not sent');
	await page.getByRole('button', { name: 'Share PDF' }).click();
	await expect(page.locator('.banner')).toContainText('Shared, delivery unknown');
	const shared = await page.evaluate(() => (window as unknown as { shared: { name: string; type: string; head: string; size: number; b64: string }[] }).shared);
	expect(shared).toHaveLength(1);
	expect(shared[0].head).toBe('%PDF-');
	expect(shared[0].type).toBe('application/pdf');
	expect(shared[0].name).toMatch(/^AOP-\d{14}-[0-9A-F]{8}\.pdf$/);
	if (process.env.REPORT_PDF_OUT) writeFileSync(process.env.REPORT_PDF_OUT, Buffer.from(shared[0].b64, 'base64'));

	await page.locator('.steps button', { hasText: '1. Load' }).click();
	await type(page, 'load:pilot', '85');
	await page.locator('.keys button', { hasText: 'Next field' }).click();
	await page.locator('.steps button', { hasText: '4. Send' }).click();
	await expect(page.locator('.banner')).toContainText('The inputs changed');
	await expect(page.getByRole('button', { name: 'Create report' })).toBeEnabled();
	await page.getByRole('button', { name: 'Create report' }).click();
	await expect(page.getByRole('button', { name: 'Reports (2)' })).toBeVisible();

	await page.reload();
	await page.getByRole('button', { name: 'Reports (2)' }).click();
	await expect(page.locator('.report-row')).toHaveCount(2);
	await expect(page.locator('.report-row').nth(1)).toContainText('Shared, delivery unknown');
	await expect(page.locator('.report-row').nth(0)).toContainText('Not sent');
	await page.locator('.report-row').nth(0).getByRole('button', { name: 'Delete' }).click();
	await expect(page.locator('.report-row')).toHaveCount(2);
	await page.getByRole('button', { name: 'Tap again to delete' }).click();
	await expect(page.locator('.report-row')).toHaveCount(1);
	expect(errors).toEqual([]);
});

test('report can be created with no connection', async ({ page, context }) => {
	const errors = await failOnErrors(page);
	await page.goto('/');
	await page.evaluate(() => navigator.serviceWorker.ready);
	await page.reload();
	await page.getByRole('button', { name: /^TEST-KF/ }).click();
	await context.setOffline(true);
	await type(page, 'load:seats', '150');
	await page.locator('.keys button', { hasText: 'Next field' }).click();
	await page.locator('.steps button', { hasText: '2. Fuel' }).click();
	await type(page, 'fuel:main', '60');
	await type(page, 'time', '0');
	await type(page, 'flow', '0');
	await page.locator('.keys button', { hasText: 'Done' }).click();
	await page.locator('.steps button', { hasText: '3. Conditions' }).click();
	for (const [id, value] of [['elev', '0'], ['rwy', '36'], ['qnh', '1013'], ['oat', '15'], ['wdir', '0'], ['wspd', '0']]) await type(page, id, value);
	await page.locator('.keys button', { hasText: 'Done' }).click();
	await page.locator('.steps button', { hasText: '4. Send' }).click();
	await page.locator('#f-place').fill('LSXX');
	await page.locator('#f-name').fill('A Pilot');
	await page.getByRole('button', { name: 'Create report' }).click();
	await expect(page.locator('.banner')).toContainText('Not sent');
	await context.setOffline(false);
	expect(errors).toEqual([]);
});

const METAR = { raw: 'METAR LSXX 061250Z 24008KT 200V280 9999 FEW040 12/06 Q1009', station: 'LSXX', stationName: 'Example Field', distanceKm: 8.6 };
async function toConditions(page: Page) {
	await page.goto('/');
	await page.getByRole('button', { name: /^TEST-KF/ }).click();
	await page.locator('.steps button', { hasText: '3. Conditions' }).click();
}

test('weather: prefills, needs confirming, and never overwrites what the pilot typed', async ({ page }) => {
	const errors = await failOnErrors(page);
	let calls = 0;
	await page.route('**/api/metar?*', (route) => { calls++; return route.fulfill({ json: METAR }); });
	await toConditions(page);
	expect(calls).toBe(0);
	await page.locator('#f-station').fill('lsxx');
	await expect(page.locator('#f-station')).toHaveValue(/LSXX/i);
	await page.getByRole('button', { name: 'Get METAR' }).click();
	await expect(page.locator('.metar .raw')).toHaveText(METAR.raw);
	await expect(page.locator('.metar')).toContainText('8.6 km away');
	await expect(page.locator('.flag')).toContainText('200° to 280°');
	await expect(page.locator('#f-qnh')).toHaveValue('1009');
	await expect(page.locator('#w-qnh')).toContainText('From METAR LSXX');
	await expect(page.getByRole('button', { name: 'I checked these: confirm 4 weather values' })).toBeVisible();

	await type(page, 'oat', '9');
	await page.locator('.keys button', { hasText: /Next field|Done/ }).click();
	await expect(page.getByRole('button', { name: 'I checked these: confirm 3 weather values' })).toBeVisible();
	await page.getByRole('button', { name: 'I checked these' }).click();
	await expect(page.locator('#w-qnh')).toContainText('Confirmed, from METAR LSXX');

	await page.unroute('**/api/metar?*');
	await page.route('**/api/metar?*', (route) => route.fulfill({ json: { ...METAR, raw: 'METAR LSXX 061320Z 26011KT 14/06 Q1008' } }));
	await page.getByRole('button', { name: 'Get METAR' }).click();
	await expect(page.locator('#f-qnh')).toHaveValue('1008');
	await expect(page.locator('#w-qnh')).toContainText('was 1009');
	await expect(page.locator('#f-oat')).toHaveValue('9');
	expect(errors).toEqual([]);
});

for (const [name, status, body, message] of [
	['service down', 502, { error: 'unavailable' }, 'Weather is unavailable right now'],
	['no key set up', 501, { error: 'notConfigured' }, "Weather isn't set up"],
	['no station', 404, { error: 'noStation' }, 'No report found']
] as const) {
	test(`weather failure falls back to manual entry: ${name}`, async ({ page }) => {
		await page.route('**/api/metar?*', (route) => route.fulfill({ status, json: body }));
		await toConditions(page);
		await page.locator('#f-station').fill('LSXX');
		await page.getByRole('button', { name: 'Get METAR' }).click();
		await expect(page.locator('.banner')).toContainText(message);
		await type(page, 'qnh', '1013');
		await expect(page.locator('#f-qnh')).toHaveValue('1013');
	});
}

test('weather with no connection says so, and manual entry works', async ({ page, context }) => {
	await page.goto('/');
	await page.evaluate(() => navigator.serviceWorker.ready);
	await page.reload();
	await page.getByRole('button', { name: /^TEST-KF/ }).click();
	await page.locator('.steps button', { hasText: '3. Conditions' }).click();
	await context.setOffline(true);
	await page.locator('#f-station').fill('LSXX');
	await page.getByRole('button', { name: 'Get METAR' }).click();
	await expect(page.locator('.banner')).toContainText('No connection');
	await type(page, 'qnh', '1013');
	await expect(page.locator('#f-qnh')).toHaveValue('1013');
	await context.setOffline(false);
});

test('an old report gets a strong warning', async ({ page }) => {
	await page.route('**/api/metar?*', (route) => route.fulfill({ json: { ...METAR, raw: 'METAR LSXX 010000Z 24008KT 12/06 Q1009' } }));
	await toConditions(page);
	await page.locator('#f-station').fill('LSXX');
	await page.getByRole('button', { name: 'Get METAR' }).click();
	await expect(page.locator('.metar .banner')).toContainText('minutes old');
});

test('the proxy has no key in this test, and says so without crashing', async ({ request }) => {
	const r = await request.get('/api/metar?station=LSZH', { headers: { 'sec-fetch-site': 'same-origin' } });
	expect([200, 501]).toContain(r.status());
	expect((await request.get('/api/metar?station=../x')).status()).toBe(400);
	expect((await request.get('/api/metar?station=LSZH', { headers: { 'sec-fetch-site': 'cross-site' } })).status()).toBe(403);
});

async function realIndex(page: Page) {
	return (await page.request.get('/data/index.json')).json();
}

test('new data: nothing changes until Install, then values need confirming again', async ({ page }) => {
	const errors = await failOnErrors(page);
	await page.goto('/');
	await page.getByRole('button', { name: /^TEST-DR/ }).click();
	await page.locator('.steps button', { hasText: '2. Fuel' }).click();
	await page.getByRole('button', { name: 'Confirm' }).click();
	await expect(page.locator('[id="w-flow"]')).toContainText('Confirmed');

	const index = await realIndex(page);
	await page.route('**/data/index.json', (route) => route.fulfill({ json: { ...index, release: 2, notes: 'Example update.' } }));
	await page.getByRole('button', { name: 'Check for new data' }).click();
	await expect(page.getByText('New data available: Release 2. Example update.')).toBeVisible();
	await expect(page.locator('[id="w-flow"]')).toContainText('Confirmed');

	await page.getByRole('button', { name: 'Install' }).click();
	await expect(page.getByText('New data available')).toBeHidden();
	await expect(page.getByText('Recalculated with Release 2')).toBeVisible();
	await expect(page.locator('[id="w-flow"]')).toContainText('From aircraft data');
	expect(errors).toEqual([]);
});

test('a bad download keeps the last verified release', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: /^TEST-DR/ }).click();
	const index = await realIndex(page);
	const bad = { ...index, release: 2, aircraft: index.aircraft.map((e: { sha256: string }, i: number) => (i === 0 ? { ...e, sha256: 'a'.repeat(64) } : e)) };
	await page.route('**/data/index.json', (route) => route.fulfill({ json: bad }));
	await page.getByRole('button', { name: 'Check for new data' }).click();
	await page.getByRole('button', { name: 'Install' }).click();
	await expect(page.getByText('Update failed, still using Release 1')).toBeVisible();
	await expect(page.locator('.strip')).toBeVisible();
	await page.unroute('**/data/index.json');
	await page.route('**/data/index.json', (route) => route.abort());
	await page.reload();
	await expect(page.locator('.strip')).toBeVisible();
});

test('a withdrawn aircraft is blocked at once, before Install, with the reason', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: /^TEST-DR/ }).click();
	await expect(page.locator('.strip')).toBeVisible();
	const index = await realIndex(page);
	const withdrawn = { ...index, release: 2, aircraft: index.aircraft.map((e: { registration: string; type: string; revision: number }) => (e.registration === 'TEST-DR' ? { registration: e.registration, type: e.type, revision: e.revision, withdrawn: { reason: 'Data error found' } } : e)) };
	await page.route('**/data/index.json', (route) => route.fulfill({ json: withdrawn }));
	await page.getByRole('button', { name: 'Check for new data' }).click();
	await expect(page.getByRole('alert')).toContainText('Data error found');
	await expect(page.locator('.strip')).toBeHidden();
	await expect(page.getByRole('button', { name: '+ Next flight' })).toBeDisabled();

	await page.route('**/data/index.json', (route) => route.abort());
	await page.reload();
	await expect(page.getByRole('alert')).toContainText('Data error found');

	await page.unroute('**/data/index.json');
	await page.route('**/data/index.json', (route) => route.fulfill({ json: withdrawn }));
	await page.getByRole('button', { name: '+ New' }).click();
	await expect(page.getByRole('button', { name: /^TEST-DR/ })).toBeHidden();
	await expect(page.getByRole('button', { name: /^TEST-KF/ })).toBeVisible();
});

test('first launch with no data asks to connect, and can then recover', async ({ page }) => {
	await page.route('**/data/index.json', (route) => route.abort());
	await page.goto('/');
	await expect(page.getByText('Connect to the internet once to download aircraft data')).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Choose an aircraft' })).toBeHidden();
	await page.unroute('**/data/index.json');
	await page.getByRole('button', { name: 'Try again' }).click();
	await expect(page.getByRole('heading', { name: 'Choose an aircraft' })).toBeVisible();
});

test('damaged stored data is refused, and calculations cannot run on it', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { name: 'Choose an aircraft' })).toBeVisible();
	await expect.poll(() => page.evaluate(() => new Promise((done) => {
		const open = indexedDB.open('keyval-store');
		open.onsuccess = () => {
			const get = open.result.transaction('keyval').objectStore('keyval').get('data-release-v1');
			get.onsuccess = () => done(!!get.result);
		};
	}))).toBe(true);
	await page.evaluate(() => new Promise<void>((done) => {
		const open = indexedDB.open('keyval-store');
		open.onsuccess = () => {
			const store = open.result.transaction('keyval', 'readwrite').objectStore('keyval');
			const get = store.get('data-release-v1');
			get.onsuccess = () => {
				const data = get.result;
				data.aircraft[0].tables[Object.keys(data.aircraft[0].tables)[0]].source = 'tampered';
				store.put(data, 'data-release-v1').onsuccess = () => done();
			};
		};
	}));
	await page.route('**/data/index.json', (route) => route.abort());
	await page.reload();
	await expect(page.getByText("The aircraft data on this device is damaged")).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Choose an aircraft' })).toBeHidden();
	await page.unroute('**/data/index.json');
	await page.getByRole('button', { name: 'Try again' }).click();
	await expect(page.getByRole('heading', { name: 'Choose an aircraft' })).toBeVisible();
});

test('warns strongly after 30 days without a check, but still calculates', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: /^TEST-KF/ }).click();
	await expect(page.locator('.strip')).toBeVisible();
	await expect.poll(() => page.evaluate(() => new Promise((done) => {
		const open = indexedDB.open('keyval-store');
		open.onsuccess = () => {
			const store = open.result.transaction('keyval', 'readwrite').objectStore('keyval');
			const get = store.get('data-meta-v1');
			get.onsuccess = () => {
				if (!get.result) return done(false);
				store.put({ ...get.result, lastCheck: Date.now() - 31 * 86400000 }, 'data-meta-v1').onsuccess = () => done(true);
			};
		};
	}))).toBe(true);
	await page.route('**/data/index.json', (route) => route.abort());
	await page.reload();
	await expect(page.getByText('No check for new aircraft data in over 30 days')).toBeVisible();
	await expect(page.locator('.strip')).toBeVisible();
});
