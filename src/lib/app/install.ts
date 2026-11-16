/**
 * Whether to offer installing the app to the home screen, and how.
 * Installed, the app opens without the browser around it, works offline from the first tap,
 * and iPadOS keeps its saved data instead of clearing it after weeks without a visit.
 */

/** "prompt": the browser can show its own install dialog. "ios": iOS and iPadOS install only through the Share menu. */
export type InstallWay = 'prompt' | 'ios';

/** After "Not now", the offer stays away this long. */
export const SNOOZE_DAYS = 14;
const DAY = 24 * 60 * 60 * 1000;

export type InstallContext = {
	/** Already running as an installed app. */
	standalone: boolean;
	/** The browser fired beforeinstallprompt, so it can install on a tap. */
	canPrompt: boolean;
	ios: boolean;
	/** Driven by test automation, where a popup would only get in the way. */
	automated: boolean;
	/** When the pilot last chose "Not now", in milliseconds. */
	dismissedAt: number | null;
	now: number;
};

export function installWay(c: InstallContext): InstallWay | null {
	if (c.standalone || c.automated) return null;
	if (c.dismissedAt !== null && c.now - c.dismissedAt < SNOOZE_DAYS * DAY) return null;
	if (c.canPrompt) return 'prompt';
	if (c.ios) return 'ios';
	return null;
}

/** iPhone, and iPad, which asks for desktop sites and so calls itself a Mac, but one with a touch screen. */
export function isIos(userAgent: string, maxTouchPoints: number): boolean {
	return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}
