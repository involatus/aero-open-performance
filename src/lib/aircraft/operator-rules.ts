/**
 * Operator Rules: the operator's own corrections, used only where an aircraft's manual gives none.
 * They are set once in the admin and travel with each release, not inside the aircraft files,
 * so every aircraft in a release uses the same rules.
 */
import * as v from 'valibot';
import type { Aircraft } from './schema.ts';
import { validateAircraft } from './validate.ts';

const Positive = v.pipe(v.number(), v.finite(), v.gtValue(0));
const PerKnots = v.strictObject({ percent: Positive, perKnots: Positive });

export const OperatorRules = v.strictObject({
	/** For conditions whose manual gives no wind correction. No headwind entry means no headwind credit. */
	wind: v.optional(v.strictObject({
		headwind: v.optional(PerKnots),
		tailwind: v.optional(v.strictObject({ percent: Positive, perKnots: Positive, maxKnots: v.optional(Positive) }))
	})),
	/**
	 * Above a table's highest altitude, where the manual gives no result. The value at the top row grows
	 * by the larger of the table's own trend with air density and these percentages per 1000 ft.
	 * Above `alertAboveM` past the table the pilot is warned more strongly; there is no limit.
	 */
	aboveTable: v.optional(v.strictObject({
		takeoffPercentPer1000ft: Positive,
		landingPercentPer1000ft: Positive,
		alertAboveM: Positive
	}))
});
export type OperatorRules = v.InferOutput<typeof OperatorRules>;

/** The trace's source for a step that comes from an Operator Rule, not from the manual. */
export const OPERATOR_SOURCE = 'operator';
export const OPERATOR_SOURCE_TEXT = 'Operator rule';

/** UK CAA Safety Sense Leaflet 09 figures, offered as the starting point in the admin. */
export const SUGGESTED_RULES: OperatorRules = {
	wind: { headwind: { percent: 10, perKnots: 12 }, tailwind: { percent: 10, perKnots: 2, maxKnots: 10 } },
	aboveTable: { takeoffPercentPer1000ft: 10, landingPercentPer1000ft: 5, alertAboveM: 500 }
};

export function parseRules(data: unknown): { ok: true; rules: OperatorRules | undefined } | { ok: false; problem: string } {
	if (data === undefined || data === null) return { ok: true, rules: undefined };
	const r = v.safeParse(OperatorRules, data);
	if (!r.success) return { ok: false, problem: `Operator rules are not valid: ${r.issues[0].message}` };
	const empty = !r.output.wind && !r.output.aboveTable;
	return { ok: true, rules: empty ? undefined : r.output };
}

/**
 * A draft or file as the engine runs it: validated once, with the release's rules. Publish checks and
 * the admin editor both go through here, so no check can run an aircraft without the rules pilots get.
 */
export function prepareAircraft(data: unknown, rules: OperatorRules | undefined): { ok: true; aircraft: Aircraft; problems: [] } | { ok: false; problems: string[] } {
	const v = validateAircraft(data);
	return v.ok ? { ok: true, aircraft: withRules(v.aircraft, rules), problems: [] } : v;
}

/** The aircraft as the engine runs it, with the release's rules. Rules never come from the aircraft file itself. */
export function withRules(a: Aircraft, rules: OperatorRules | undefined): Aircraft {
	const { operatorRules: _, ...rest } = a;
	return rules ? { ...rest, operatorRules: rules } : rest;
}

export function sameRules(a: OperatorRules | undefined, b: OperatorRules | undefined): boolean {
	return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}
