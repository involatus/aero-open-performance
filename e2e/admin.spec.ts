import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

test.use({ baseURL: 'http://localhost:4319' });
test.describe.configure({ mode: 'serial' });

const example = JSON.parse(readFileSync('aircraft-examples/test-kitfox-style.json', 'utf8'));

async function failOnErrors(page: Page) {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	return errors;
}
async function api(page: Page, action: string, body = {}) {
	return (await page.request.post('/api/admin', { data: { action, ...body } })).json();
}
async function importAircraft(page: Page, data: unknown, name = 'aircraft.json') {
	await page.locator('input[type=file]').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
}

test.beforeEach(async ({ page }) => {
	const r = await page.request.post('/api/admin', { data: { action: 'signIn', name: 'Test Admin', password: 'playwright-test-password' } });
	expect(r.ok()).toBe(true);
});

test('only the right password signs in, and sign out ends the session', async ({ browser }) => {
	const context = await browser.newContext({ baseURL: 'http://localhost:4319' });
	const page = await context.newPage();
	expect((await page.request.post('/api/admin', { data: { action: 'overview' } })).status()).toBe(401);
	await page.goto('/admin');
	await page.getByLabel('Your name').fill('Anna Example');
	await page.getByLabel('Admin password').fill('wrong-password');
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page.getByText('That password isn\'t right.')).toBeVisible();
	expect((await page.request.post('/api/admin', { data: { action: 'overview' } })).status()).toBe(401);
	await page.getByLabel('Admin password').fill('playwright-test-password');
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page.getByText('Anna Example')).toBeVisible();
	expect((await page.request.post('/api/admin', { data: { action: 'overview' } })).status()).toBe(200);
	await page.getByRole('button', { name: 'Sign out' }).click();
	await expect(page.getByLabel('Admin password')).toBeVisible();
	expect((await page.request.post('/api/admin', { data: { action: 'overview' } })).status()).toBe(401);
	await context.close();
});

test('the public can read nothing private, and other sites are refused', async ({ page, playwright }) => {
	const outsider = await playwright.request.newContext({ baseURL: 'http://localhost:4317' });
	const r = await outsider.post('/api/admin', { data: { action: 'status' } });
	expect((await r.json()).signedIn).toBe(false);
	expect((await outsider.post('/api/admin', { data: { action: 'overview' } })).status()).toBe(501);
	expect((await outsider.get('/api/data/index.json')).ok()).toBe(true);
	expect(await (await outsider.get('/api/data/index.json')).json()).toBeNull();
	await outsider.dispose();
	const cross = await page.request.post('/api/admin', { data: { action: 'overview' }, headers: { 'sec-fetch-site': 'cross-site' } });
	expect(cross.status()).toBe(403);
	expect(await (await page.request.get('/api/data/..%2Fsettings.json')).json().catch(() => null)).toBeNull();
});

test('a deployment with no admin set up says so, and pilots are unaffected', async ({ browser }) => {
	const page = await (await browser.newContext({ baseURL: 'http://localhost:4317' })).newPage();
	await page.goto('/admin');
	await expect(page.getByText('Not set up on this deployment')).toBeVisible();
	await page.goto('/');
	await expect(page.getByRole('button', { name: /^TEST-KF/ })).toBeVisible();
	await page.close();
});

test('forms, tables and JSON all edit the same draft, and saving survives a reload', async ({ page }) => {
	const errors = await failOnErrors(page);
	await page.goto('/admin');
	await page.getByLabel('New registration').fill('HB-NEW');
	await page.getByRole('button', { name: 'Add aircraft' }).click();
	await expect(page.getByRole('heading', { name: 'HB-NEW' })).toBeVisible();
	for (const tab of ['Aircraft', 'Documents', 'Weighing', 'Load', 'Fuel', 'Limits', 'Tables', 'Performance', 'Notes', 'Test cases', 'Second entry', 'Try it', 'Check', 'JSON']) {
		await page.getByRole('navigation').getByRole('button', { name: tab, exact: true }).click();
		await expect(page.locator('section h2').first()).toBeVisible();
	}
	await page.getByRole('navigation').getByRole('button', { name: 'Aircraft', exact: true }).click();
	await page.getByLabel('Aircraft type').fill('Test type');
	await expect(page.getByRole('button', { name: 'Save draft' })).toBeEnabled();

	await page.getByRole('navigation').getByRole('button', { name: 'Tables', exact: true }).click();
	await page.getByLabel('New table name').fill('takeoff');
	await page.getByRole('button', { name: 'Add table' }).click();
	await page.getByRole('textbox', { name: 'Altitude 0, Temperature 0' }).focus();
	await page.evaluate(() => {
		const data = new DataTransfer();
		data.setData('text/plain', '100\t110\r\n120,5\tabc\r\n');
		document.activeElement!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
	});
	await expect(page.getByRole('textbox', { name: 'Altitude 2000, Temperature 0' })).toHaveValue('120.5');
	const bad = page.getByRole('textbox', { name: 'Altitude 2000, Temperature 20' });
	await expect(bad).toHaveValue('abc');
	await expect(bad).toHaveAttribute('aria-invalid', 'true');

	await page.getByRole('button', { name: 'Save draft' }).click();
	await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeDisabled();
	await page.reload();
	await page.getByRole('button', { name: 'Edit' }).click();
	await expect(page.getByLabel('Aircraft type')).toHaveValue('Test type');
	await page.getByRole('navigation').getByRole('button', { name: 'JSON', exact: true }).click();
	const json = JSON.parse(await page.getByLabel('Aircraft file as JSON').inputValue());
	expect(json.tables.takeoff.outputs.total).toEqual([[100, 110], [120.5, null]]);
	expect(errors).toEqual([]);
	await page.getByRole('button', { name: 'Back to list' }).click();
	await page.getByRole('button', { name: 'Delete' }).click();
	await page.getByRole('button', { name: 'Tap again to delete draft' }).click();
	await expect(page.getByText('No aircraft yet')).toBeVisible();
});

test('a US manual is typed in lb and inches, pilots get kg and cm, and the envelope is drawn', async ({ page }) => {
	const errors = await failOnErrors(page);
	await page.goto('/admin');
	await page.getByLabel('New registration').fill('HB-USA');
	await page.getByRole('button', { name: 'Add aircraft' }).click();
	const tab = (name: string) => page.getByRole('navigation').getByRole('button', { name, exact: true }).click();

	await page.getByLabel('Aircraft type').fill('US type');
	const manual = page.getByRole('group', { name: 'Units in the manual' });
	await manual.getByLabel('Mass').selectOption('lb');
	await manual.getByLabel('Arm').selectOption('in');
	await manual.getByLabel('Fuel').selectOption('USgal');
	await page.getByRole('group', { name: 'Units pilots see' }).getByLabel('Arm').selectOption('cm');

	await tab('Documents');
	await page.getByLabel('Document').first().fill('POH Test');
	await page.getByLabel('Document').first().blur();

	await tab('Load');
	await page.getByRole('button', { name: 'Add station' }).click();
	await page.getByLabel('Name pilots see').fill('Pilot');
	await page.getByRole('textbox', { name: 'Arm', exact: true }).fill('101');
	await expect(page.getByText('Pilots see 256.54 cm')).toBeVisible();
	await page.getByLabel('Source page').fill('6-3');
	await page.getByLabel('Source page').blur();
	await page.getByRole('button', { name: 'Add station' }).click();
	await page.getByLabel('Name pilots see').nth(1).fill('Baggage');
	await page.getByLabel('Maximum load').nth(1).fill('1,960');
	await expect(page.getByText('a comma before three digits could mean either')).toBeVisible();
	await page.getByLabel('Maximum load').nth(1).fill('250');
	await expect(page.getByText('Pilots see 113.398 kg')).toBeVisible();

	await tab('Limits');
	await page.getByLabel('Maximum takeoff mass').fill('1960');
	await page.getByRole('button', { name: 'Landing is the same as takeoff' }).click();
	await page.getByText('Fill in a box-shaped envelope').click();
	await page.getByLabel('Forward limit').fill('95.6');
	await page.getByLabel('Aft limit').fill('103.5');
	await page.getByLabel('Lowest mass on the graph').fill('1300');
	await page.getByLabel('Highest mass').fill('1960');
	await page.getByRole('button', { name: 'Make these four corners' }).click();
	await expect(page.getByRole('img', { name: 'CG envelope preview with 4 points' })).toBeVisible();

	await tab('JSON');
	const json = JSON.parse(await page.getByLabel('Aircraft file as JSON').inputValue());
	expect(json.units).toEqual({ mass: 'kg', arm: 'cm', volume: 'L' });
	expect(json.manualUnits).toEqual({ mass: 'lb', arm: 'in', volume: 'USgal' });
	expect(json.stations.map((s: any) => [s.id, s.label, s.arm, s.maxMass])).toEqual([['station-1', 'Pilot', 256.54, undefined], ['station-2', 'Baggage', 0, 113.3980925]]);
	expect(json.sources[json.stations[0].source]).toEqual({ document: 'POH Test', page: '6-3' });
	expect(json.massLimits.maxLanding.value).toBe(889.0410452);
	expect(json.envelope.points[0]).toEqual({ mass: 589.670081, arm: 242.824 });
	await page.getByRole('button', { name: 'Save draft' }).click();
	await page.getByRole('button', { name: 'Saved', exact: true }).waitFor();
	await page.getByRole('button', { name: 'Back to list' }).click();
	await api(page, 'deleteDraft', { id: 'HB-USA' });
	expect(errors).toEqual([]);
});

test('publishing is blocked until the checks pass, then pilots get the data', async ({ page, browser }) => {
	await page.goto('/admin');
	await page.getByLabel('Name shown on reports and data').fill('Test club');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByRole('status').first()).toContainText('Saved');

	const broken = structuredClone(example);
	broken.handCases[0].expected.takeoff.total += 1;
	await importAircraft(page, broken);
	await expect(page.getByText('Imported TEST-KF')).toBeVisible();
	await page.getByRole('button', { name: 'Publish new release' }).click();
	await expect(page.getByText('Nothing was published')).toBeVisible();
	await expect(page.locator('main > ul')).toContainText('expected');
	expect(await page.getByText('Nothing is published yet').count()).toBe(1);

	await page.getByRole('button', { name: 'Edit' }).click();
	await page.getByRole('navigation').getByRole('button', { name: 'Test cases', exact: true }).click();
	await expect(page.getByRole('status').filter({ hasText: 'cases fail' })).toBeVisible();
	await page.getByRole('navigation').getByRole('button', { name: 'Check', exact: true }).click();
	await expect(page.getByText('still to fix')).toBeVisible();
	await page.getByRole('navigation').getByRole('button', { name: 'JSON', exact: true }).click();
	await page.getByLabel('Aircraft file as JSON').fill(JSON.stringify(example));
	await page.getByRole('button', { name: 'Apply' }).click();
	await page.getByRole('navigation').getByRole('button', { name: 'Check', exact: true }).click();
	await expect(page.getByText('This aircraft passes every check')).toBeVisible();
	await page.getByRole('navigation').getByRole('button', { name: 'Try it', exact: true }).click();
	await expect(page.getByText('Takeoff mass')).toBeVisible();
	await page.getByRole('button', { name: 'Save draft' }).click();
	await page.getByRole('button', { name: 'Saved', exact: true }).waitFor();
	await page.getByRole('button', { name: 'Back to list' }).click();

	await page.getByLabel('What changed, shown to pilots').fill('First release.');
	await page.getByRole('button', { name: 'Publish new release' }).click();
	await expect(page.getByText('Published Release 1')).toBeVisible();
	await expect(page.getByText('Pilots are on Release 1')).toBeVisible();

	const pilot = await (await browser.newContext({ baseURL: 'http://localhost:4319' })).newPage();
	await pilot.goto('/');
	await expect(pilot.getByRole('button', { name: /^TEST-KF/ })).toBeVisible();
	await expect(pilot.getByRole('button', { name: /^TEST-DR/ })).toBeHidden();
	await pilot.close();
});

test('a real aircraft needs a blind second entry, and a typo is pointed out', async ({ page }) => {
	const real = structuredClone(example);
	real.registration = 'TEST-REAL';
	delete real.fictional;
	await page.goto('/admin');
	await importAircraft(page, real);
	await expect(page.getByText('Imported TEST-REAL')).toBeVisible();
	await page.getByRole('button', { name: 'Publish new release' }).click();
	await expect(page.locator('main > ul')).toContainText('entered twice');

	await page.locator('div', { hasText: /^TEST-REAL/ }).getByRole('button', { name: 'Edit' }).last().click();
	await page.getByRole('navigation').getByRole('button', { name: 'Second entry', exact: true }).click();
	await page.getByRole('button', { name: 'takeoff', exact: true }).click();
	const cell = (alt: number, t: number) => page.getByRole('textbox', { name: `Altitude ${alt}, Temperature ${t}` });
	await expect(cell(0, 0)).toHaveValue('');
	await page.getByRole('button', { name: 'Compare with the first entry' }).click();
	await expect(page.getByText('Finish this table first: 9 cells still empty')).toBeVisible();

	const t = real.tables.takeoff;
	for (const [i, alt] of t.axes[0].values.entries()) for (const [j, temp] of t.axes[1].values.entries()) await cell(alt, temp).fill(String(t.outputs.total[i][j] + (i === 0 && j === 0 ? 1 : 0)));
	await cell(0, 0).blur();
	await page.getByRole('button', { name: 'Compare with the first entry' }).click();
	await expect(page.getByRole('alert')).toContainText('1 cell differs');
	await expect(cell(0, 0)).toHaveAttribute('aria-invalid', 'true');
	await cell(0, 0).fill(String(t.outputs.total[0][0]));
	await cell(0, 0).blur();
	await page.getByRole('button', { name: 'Compare with the first entry' }).click();
	await expect(page.getByText('This table matches the first entry')).toBeVisible();
});

for (const name of ['test-dr-style', 'test-sr22-style', 'test-glastar-style', 'test-kitfox-style']) {
	test(`${name}: opening every section changes nothing`, async ({ page }) => {
		const original = JSON.parse(readFileSync(`aircraft-examples/${name}.json`, 'utf8'));
		await api(page, 'deleteDraft', { id: original.registration });
		await page.goto('/admin');
		await importAircraft(page, original);
		await expect(page.getByText(`Imported ${original.registration}`)).toBeVisible();
		await page.locator('div', { hasText: new RegExp(`^${original.registration}`) }).getByRole('button', { name: 'Edit' }).last().click();
		for (const tab of ['Aircraft', 'Documents', 'Weighing', 'Load', 'Fuel', 'Limits', 'Tables', 'Performance', 'Notes', 'Test cases', 'Try it', 'Check']) {
			await page.getByRole('navigation').getByRole('button', { name: tab, exact: true }).click();
			await page.waitForTimeout(150);
			await expect(page.getByRole('button', { name: 'Saved', exact: true }), `${tab} marked the draft as changed`).toBeDisabled();
		}
		await page.getByRole('navigation').getByRole('button', { name: 'JSON', exact: true }).click();
		expect(JSON.parse(await page.getByLabel('Aircraft file as JSON').inputValue())).toEqual(original);
		await page.getByRole('button', { name: 'Back to list' }).click();
		if (original.registration !== 'TEST-KF') await api(page, 'deleteDraft', { id: original.registration });
	});
}

test('two admins cannot overwrite each other', async ({ page }) => {
	await page.goto('/admin');
	const { data, version } = await api(page, 'getDraft', { id: 'TEST-KF' });
	await page.locator('div', { hasText: /^TEST-KF/ }).getByRole('button', { name: 'Edit' }).last().click();
	await page.getByRole('navigation').getByRole('button', { name: 'Aircraft', exact: true }).click();
	await api(page, 'saveDraft', { id: 'TEST-KF', aircraft: data.aircraft, version });
	await page.getByLabel('Aircraft type').fill('Changed here');
	await page.getByRole('button', { name: 'Save draft' }).click();
	await expect(page.getByText('Someone else changed this draft')).toBeVisible();
});
