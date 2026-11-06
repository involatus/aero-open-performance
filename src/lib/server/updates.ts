/** Copies of the app don't update themselves, so the admin area says when a newer version exists. */
const LATEST = 'https://raw.githubusercontent.com/involatus/aero-open-performance/main/package.json';

export function isNewer(latest: string, current: string): boolean {
	const parse = (v: string) => v.split('.').map(Number);
	const a = parse(latest), b = parse(current);
	if (a.length !== 3 || b.length !== 3 || [...a, ...b].some((n) => !Number.isInteger(n))) return false;
	for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
	return false;
}

/** A failed check is never an error: it just shows nothing. */
export async function availableUpdate(current: string, doFetch: typeof fetch = fetch): Promise<string | null> {
	try {
		const response = await doFetch(LATEST, { signal: AbortSignal.timeout(3000) });
		if (!response.ok) return null;
		const { version } = (await response.json()) as { version?: string };
		return version && isNewer(version, current) ? version : null;
	} catch {
		return null;
	}
}
