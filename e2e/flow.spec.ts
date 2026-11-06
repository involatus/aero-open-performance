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
	for (const [id, value] of [['elev', '500'], ['hdg', '90'], ['qnh', '1013'], ['oat', '15'], ['wdir', '90'], ['wspd', '5']]) await type(page, id, value);
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

test('starts with no connection', async ({ page, context }) => {
	await page.goto('/');
	await page.evaluate(() => navigator.serviceWorker.ready);
	await page.reload();
	await context.setOffline(true);
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Choose an aircraft' })).toBeVisible();
	await context.setOffline(false);
});
