/**
 * The Operator profile: what a club says about itself, carried by every Data Release. Its name, its Operator Rules,
 * its logo and the address pilots send Reports to. The admin area saves it as Settings, the command-line tool
 * builds it from flags, and the release index carries it. Every setting is checked, versioned and described here,
 * so a new one is added in this file (plus the admin form and the docs).
 */
import * as v from 'valibot';
import { OperatorRules, parseRules, sameRules } from '../aircraft/operator-rules.ts';
import { OperatorLogo, parseLogo, sameLogo } from './logo.ts';
import type { Change, ReleaseIndex } from './release.ts';

/** The address pilots send Reports to. It goes only into the email text, never on screen. */
const ReportEmail = v.pipe(v.string(), v.maxLength(254), v.regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/));

/** The release index's fields for the optional settings. The Operator name is the index's `operator`. */
export const PROFILE_FIELDS = {
	/** The operator's own corrections, applied to every aircraft where its manual gives none. */
	operatorRules: v.optional(OperatorRules),
	/** The Operator's logo, shown in the app and on Reports. */
	logo: v.optional(OperatorLogo),
	/** Where pilots send Reports. Share PDF puts it in the email. */
	reportEmail: v.optional(ReportEmail)
};

export type OperatorProfile = { operator: string; operatorRules?: OperatorRules; logo?: OperatorLogo; reportEmail?: string };
type Setting = Exclude<keyof OperatorProfile, 'operator'>;

/**
 * Checks a profile as typed or sent: trims text, drops empty settings, and gives the first problem in words.
 * Settings that aren't set are left out, so a saved profile never holds an empty one.
 */
export function checkProfile(input: unknown): { ok: true; profile: OperatorProfile } | { ok: false; problem: string } {
	const p = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
	const operator = String(p.operator ?? '').trim();
	if (!operator) return { ok: false, problem: 'Enter the Operator name.' };
	const rules = parseRules(p.operatorRules);
	if (!rules.ok) return { ok: false, problem: rules.problem };
	const logo = parseLogo(p.logo);
	if (!logo.ok) return { ok: false, problem: logo.problem };
	const reportEmail = String(p.reportEmail ?? '').trim();
	if (reportEmail && !v.is(ReportEmail, reportEmail)) return { ok: false, problem: `The report address ${reportEmail} is not an email address.` };
	return { ok: true, profile: { operator, ...(rules.rules ? { operatorRules: rules.rules } : {}), ...(logo.logo ? { logo: logo.logo } : {}), ...(reportEmail ? { reportEmail } : {}) } };
}

/** The profile a release index carries. */
export function profileOf(index: ReleaseIndex): OperatorProfile {
	const { operator, operatorRules, logo, reportEmail } = index;
	return { operator, ...(operatorRules ? { operatorRules } : {}), ...(logo ? { logo } : {}), ...(reportEmail ? { reportEmail } : {}) };
}

/**
 * What to do with each setting, against the previous release: a value sets it, `null` removes it, and leaving it
 * out keeps the previous release's. The command-line tool keeps whatever it isn't told. The admin area needs no
 * merge: its saved Settings are the whole profile, and an empty setting there is removed.
 */
export type ProfileChange = { operator: string } & { [K in Setting]?: OperatorProfile[K] | null };

export function mergeProfile(previous: OperatorProfile | null, change: ProfileChange): OperatorProfile {
	const pick = <K extends Setting>(key: K) => (change[key] === null ? undefined : (change[key] ?? previous?.[key]));
	const operatorRules = pick('operatorRules'), logo = pick('logo'), reportEmail = pick('reportEmail');
	return { operator: change.operator, ...(operatorRules ? { operatorRules } : {}), ...(logo ? { logo } : {}), ...(reportEmail ? { reportEmail } : {}) };
}

/**
 * The oldest index format that has every setting this profile uses. Apps refuse a newer format than they know, so
 * stating the oldest one lets an app from before a setting still read a release without it, and lets a deployment
 * roll back without pilots' apps refusing the data.
 */
export function profileFormatVersion(profile: Partial<OperatorProfile>): string {
	if (profile.reportEmail) return '0.7.0';
	if (profile.logo) return '0.6.0';
	if (profile.operatorRules) return '0.2.0';
	return '0.1.0';
}

/** What a newer release changes in the profile, in words. Rules apply to every aircraft; the rest is the Operator's. */
export function profileChanges(installed: ReleaseIndex | null, next: ReleaseIndex): Change[] {
	const changes: Change[] = [];
	if (!sameRules(installed?.operatorRules, next.operatorRules)) changes.push({ registration: 'All aircraft', text: next.operatorRules ? 'Operator rules changed' : 'Operator rules removed' });
	if (!installed) return changes;
	const own = (text: string) => changes.push({ registration: next.operator, text });
	if (!sameLogo(installed.logo, next.logo)) own(next.logo ? (installed.logo ? 'New logo' : 'Logo added') : 'Logo removed');
	if (installed.reportEmail !== next.reportEmail) own(next.reportEmail ? (installed.reportEmail ? 'New report address' : 'Report address added') : 'Report address removed');
	return changes;
}
