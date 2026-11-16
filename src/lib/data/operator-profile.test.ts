import { describe, expect, it } from 'vitest';
import { formatIsReadable } from '../aircraft/validate.ts';
import type { OperatorRules } from '../aircraft/operator-rules.ts';
import { checkProfile, mergeProfile, profileChanges, profileFormatVersion, profileOf } from './operator-profile.ts';
import type { ReleaseIndex } from './release.ts';

const light = `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 10"/>')}`;
const rules: OperatorRules = { aboveTable: { takeoffPercentPer1000ft: 10, landingPercentPer1000ft: 5, alertAboveM: 500 } };
const index = (extra: Partial<ReleaseIndex> = {}): ReleaseIndex => ({ formatVersion: '0.1.0', operator: 'Club', release: 1, published: '2026-11-16T00:00:00.000Z', aircraft: [], ...extra });

describe('the Operator profile', () => {
	it('is trimmed, and leaves out what is not set', () => {
		expect(checkProfile({ operator: ' Club ', reportEmail: ' reports@club.example ', logo: null, operatorRules: undefined }))
			.toEqual({ ok: true, profile: { operator: 'Club', reportEmail: 'reports@club.example' } });
		expect(checkProfile({ operator: 'Club', reportEmail: '' })).toEqual({ ok: true, profile: { operator: 'Club' } });
	});

	it('says what is wrong, in one wording wherever it is checked', () => {
		expect(checkProfile({ operator: ' ' })).toEqual({ ok: false, problem: 'Enter the Operator name.' });
		expect(checkProfile(null)).toEqual({ ok: false, problem: 'Enter the Operator name.' });
		expect(checkProfile({ operator: 'Club', reportEmail: 'reports at club' })).toEqual({ ok: false, problem: 'The report address reports at club is not an email address.' });
		expect(checkProfile({ operator: 'Club', logo: { light: 'data:image/png;base64,AAAA' } })).toMatchObject({ ok: false, problem: expect.stringContaining('logo is not valid') });
		expect(checkProfile({ operator: 'Club', operatorRules: { aboveTable: { takeoffPercentPer1000ft: -1 } } })).toMatchObject({ ok: false, problem: expect.stringContaining('Operator rules are not valid') });
	});

	it('keeps a setting it is not told about, and removes one set to null', () => {
		const previous = profileOf(index({ operatorRules: rules, logo: { light }, reportEmail: 'old@club.example' }));
		expect(mergeProfile(previous, { operator: 'Club' })).toEqual({ operator: 'Club', operatorRules: rules, logo: { light }, reportEmail: 'old@club.example' });
		expect(mergeProfile(previous, { operator: 'New name', logo: null, reportEmail: 'new@club.example' })).toEqual({ operator: 'New name', operatorRules: rules, reportEmail: 'new@club.example' });
		expect(mergeProfile(null, { operator: 'Club', reportEmail: null })).toEqual({ operator: 'Club' });
	});

	it('needs a newer format only for the settings it uses, so older apps still read the rest', () => {
		expect(profileFormatVersion({})).toBe('0.1.0');
		expect(profileFormatVersion({ operatorRules: rules })).toBe('0.2.0');
		expect(profileFormatVersion({ logo: { light } })).toBe('0.6.0');
		expect(profileFormatVersion({ reportEmail: 'reports@club.example', logo: { light } })).toBe('0.7.0');
		// An app from before logos, which knows format 0.5.0.
		expect(formatIsReadable(profileFormatVersion({}), '0.5.0')).toBe(true);
		expect(formatIsReadable(profileFormatVersion({ logo: { light } }), '0.5.0')).toBe(false);
	});

	it('describes what a release changes in it', () => {
		const before = index({ logo: { light }, reportEmail: 'old@club.example' });
		expect(profileChanges(before, index({ operatorRules: rules, reportEmail: 'new@club.example' }))).toEqual([
			{ registration: 'All aircraft', text: 'Operator rules changed' },
			{ registration: 'Club', text: 'Logo removed' },
			{ registration: 'Club', text: 'New report address' }
		]);
		expect(profileChanges(index(), index({ logo: { light }, reportEmail: 'a@club.example' }))).toEqual([
			{ registration: 'Club', text: 'Logo added' },
			{ registration: 'Club', text: 'Report address added' }
		]);
		// A first install lists the aircraft, not the Operator's own settings.
		expect(profileChanges(null, index({ logo: { light } }))).toEqual([]);
		expect(profileChanges(before, before)).toEqual([]);
	});
});
