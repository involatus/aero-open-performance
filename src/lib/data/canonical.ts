/** RFC 8785 canonical JSON and SHA-256, so a file's checksum doesn't depend on its formatting. */
export function canonicalize(value: unknown): string {
	if (value === null || typeof value !== 'object') {
		if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Numbers must be finite');
		return JSON.stringify(value);
	}
	if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
	const object = value as Record<string, unknown>;
	const keys = Object.keys(object).filter((k) => object[k] !== undefined).sort(); // Default sort is by UTF-16 code unit, as RFC 8785 requires.
	return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(object[k])}`).join(',')}}`;
}

export async function sha256(value: unknown): Promise<string> {
	const bytes = new TextEncoder().encode(canonicalize(value));
	const digest = await crypto.subtle.digest('SHA-256', bytes);
	return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
