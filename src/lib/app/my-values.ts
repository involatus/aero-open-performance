/**
 * The pilot's own values, such as their weight or a usual flight bag, kept on this device only.
 * They are offered as one-tap choices and never filled in by themselves, so an old weight is never
 * used without the pilot seeing it. Stored in kg, shown in the aircraft's unit.
 */
import { convertMass } from '../engine/units.ts';

/** A person goes on seats, a thing in baggage areas, so neither is offered where it can't go. */
export type SavedKind = 'person' | 'item';
export type SavedMass = { id: string; label: string; kg: number; kind?: SavedKind };

const BAGGAGE = /bag|gep(ä|ae)ck|luggage|cargo|freight|hat ?rack|hutablage|compartment|locker|fret|soute|stauraum/i;
/** Whether a Loading Station carries people or things: as the aircraft data says, else guessed from its name. */
export const stationKind = (station: { id: string; label: string; carries?: 'people' | 'baggage' }): SavedKind =>
	station.carries ? (station.carries === 'baggage' ? 'item' : 'person') : guessKind(station);
/** For stations the Data Owner hasn't set yet: baggage, cargo, hat rack and the like are for things. */
export const guessKind = (station: { id: string; label: string }): SavedKind => (BAGGAGE.test(`${station.label} ${station.id}`) ? 'item' : 'person');
/** The saved values for a station of this kind. Older entries without a kind count as people. */
export const savedFor = (list: SavedMass[], kind: SavedKind) => list.filter((s) => (s.kind ?? 'person') === kind);

const clean = (label: string) => label.trim().replace(/\s+/g, ' ').slice(0, 30);

/** Adds a value, or replaces the one with the same name. Newest first. */
export function saveMass(list: SavedMass[], label: string, value: number, unit: string, now: number, kind: SavedKind = 'person'): SavedMass[] {
	const name = clean(label);
	if (!name || !Number.isFinite(value) || value <= 0) return list;
	const kg = convertMass(value, unit, 'kg');
	const rest = list.filter((s) => !(s.label.toLowerCase() === name.toLowerCase() && (s.kind ?? 'person') === kind));
	return [{ id: `m${now.toString(36)}`, label: name, kg, kind }, ...rest];
}

export function removeMass(list: SavedMass[], id: string): SavedMass[] {
	return list.filter((s) => s.id !== id);
}

/** The value as the field takes it, in the aircraft's unit and its decimals. */
export function massIn(s: SavedMass, unit: string, decimals: number): string {
	const v = convertMass(s.kg, 'kg', unit);
	return String(Number(v.toFixed(decimals)));
}

/** Only what a stored list can safely hold, so a damaged entry is dropped rather than used. */
export function readSaved(data: unknown): SavedMass[] {
	if (!Array.isArray(data)) return [];
	return data.filter((s): s is SavedMass => !!s && typeof s.id === 'string' && typeof s.label === 'string' && !!clean(s.label) && typeof s.kg === 'number' && Number.isFinite(s.kg) && s.kg > 0 && (s.kind === undefined || s.kind === 'person' || s.kind === 'item'));
}
