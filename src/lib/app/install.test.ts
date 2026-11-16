import { describe, expect, it } from 'vitest';
import { installWay, isIos, SNOOZE_DAYS, type InstallContext } from './install.ts';

const NOW = Date.UTC(2026, 10, 16);
const base: InstallContext = { standalone: false, canPrompt: false, ios: false, automated: false, dismissedAt: null, now: NOW };
const DAY = 24 * 60 * 60 * 1000;

describe('installWay', () => {
	it('offers the browser dialog when the browser can install', () => {
		expect(installWay({ ...base, canPrompt: true })).toBe('prompt');
	});

	it('offers the Share menu steps on iOS and iPadOS', () => {
		expect(installWay({ ...base, ios: true })).toBe('ios');
	});

	it('offers nothing where the browser cannot install and it is not iOS', () => {
		expect(installWay(base)).toBeNull();
	});

	it('offers nothing once installed', () => {
		expect(installWay({ ...base, standalone: true, canPrompt: true, ios: true })).toBeNull();
	});

	it('offers nothing under test automation', () => {
		expect(installWay({ ...base, automated: true, canPrompt: true })).toBeNull();
	});

	it('stays away after "Not now" until the snooze ends', () => {
		expect(installWay({ ...base, ios: true, dismissedAt: NOW - (SNOOZE_DAYS - 1) * DAY })).toBeNull();
		expect(installWay({ ...base, ios: true, dismissedAt: NOW - SNOOZE_DAYS * DAY })).toBe('ios');
	});
});

describe('isIos', () => {
	it('knows an iPhone', () => {
		expect(isIos('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15', 5)).toBe(true);
	});

	it('knows an iPad that asks for desktop sites by its touch screen', () => {
		expect(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', 5)).toBe(true);
	});

	it('does not take a Mac for an iPad', () => {
		expect(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', 0)).toBe(false);
	});
});
