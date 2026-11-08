/**
 * A person compares each table, row by row, with the printed manual. The check records who did it,
 * when, and a fingerprint of what they saw, so any later change to the values makes it void.
 */
import type { Aircraft, Table } from '../aircraft/schema.ts';
import { canonicalize } from './canonical.ts';

/** FNV-1a, 64-bit. It detects accidental changes; nobody gains anything by forging it. */
export function tableFingerprint(table: Pick<Table, 'axes' | 'outputs'>): string {
	const text = canonicalize({ axes: table.axes.map((a) => ({ unit: a.unit, values: a.values })), outputs: table.outputs });
	let hash = 0xcbf29ce484222325n;
	for (const byte of new TextEncoder().encode(text)) hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * 0x100000001b3n);
	return hash.toString(16).padStart(16, '0');
}

export type TableCheckState = { status: 'checked'; by: string; date: string } | { status: 'changed'; by: string; date: string } | { status: 'unchecked' };

export function tableCheckState(table: Table): TableCheckState {
	if (!table.checked) return { status: 'unchecked' };
	const { by, date } = table.checked;
	return table.checked.fingerprint === tableFingerprint(table) ? { status: 'checked', by, date } : { status: 'changed', by, date };
}

/** Real aircraft need every table checked against the manual, and unchanged since. */
export function tableCheckProblems(a: Aircraft): string[] {
	if (a.fictional) return [];
	const out: string[] = [];
	for (const [id, table] of Object.entries(a.tables)) {
		const state = tableCheckState(table);
		if (state.status === 'unchecked') out.push(`Table ${id}: not yet compared with the manual, row by row (fingerprint ${tableFingerprint(table)})`);
		if (state.status === 'changed') out.push(`Table ${id}: changed after ${state.by} compared it with the manual on ${state.date}. Compare it again (fingerprint ${tableFingerprint(table)})`);
	}
	return out;
}
