/** Turns the published aircraft schema into the sections of the setup form, with labels people can read. */
import schema from '../../../schema/aircraft.schema.json';

const LABELS: Record<string, string> = {
	formatVersion: 'Format version', registration: 'Registration', type: 'Aircraft type', revision: 'Revision', fictional: 'Fictional aircraft',
	units: 'Units', mass: 'Mass', arm: 'Arm', volume: 'Volume', display: 'Decimals shown', massDecimals: 'Mass decimals', armDecimals: 'Arm decimals',
	stations: 'Loading Stations', id: 'Short name (no spaces)', label: 'Label', positions: 'Seat positions', defaultPosition: 'Default position', maxMass: 'Maximum mass', source: 'Source (short name)',
	tanks: 'Tanks', capacity: 'Capacity', density: 'Fuel density (mass per volume)', combinedLimits: 'Combined limits', massLimits: 'Mass limits', maxTakeoff: 'Maximum takeoff mass', maxLanding: 'Maximum landing mass', value: 'Value',
	envelope: 'CG Envelope', points: 'Points, in order around the shape', percentMac: 'Percent MAC', mac: 'Mean aerodynamic chord (only for limits in % MAC)', leadingEdgeArm: 'Leading edge arm', length: 'Length',
	burnPlans: 'Burn Plans', tanksInOrder: 'Tanks in order', defaultBurnPlan: 'Preselected Burn Plan (short name)', fuelFlow: 'Typical fuel flow', crosswind: 'Crosswind figure (kt)',
	notes: 'Manual notes the pilot must confirm', text: 'Text', configurations: 'Configurations', weighing: 'Weighing', moment: 'Moment', date: 'Date',
	performance: 'Performance', takeoff: 'Takeoff conditions', landing: 'Landing conditions', distanceUnit: 'Distance unit', steps: 'Performance Steps, in the manual\'s order', assumes: 'Conditions the manual assumes', inputs: 'Assumed inputs', input: 'Input', unit: 'Unit',
	table: 'Table (short name)', total: 'Total distance', groundRoll: 'Ground roll', applies: 'Applies to', reason: 'Reason', referenceMass: 'Reference mass', exponent: 'Exponent', headwind: 'Headwind rule', tailwind: 'Tailwind rule', mode: 'Mode', percent: 'Percent', perKnots: 'Per knots', maxKnots: 'Maximum knots', above: 'Beyond the maximum', carryToTotal: 'Also add to total distance', from: 'From', into: 'Sets', kind: 'Kind',
	stationsList: 'Stations', document: 'Document', page: 'Page'
};
const VARIANT_TITLES: Record<string, string> = {
	lookup: 'Table lookup', fixed: 'Fixed value', factor: 'Factor', massCorrection: 'Mass correction', wind: 'Wind correction', surface: 'Surface factor', ratio: 'Ratio',
	steps: 'Uses Performance Steps', noData: 'No data: pilot\'s judgement', even: 'Evenly', sequence: 'One tank after another'
};

type Node = Record<string, any>;

function titled(node: Node, key?: string): Node {
	if (!node || typeof node !== 'object') return node;
	const out: Node = { ...node };
	if (key && !out.title && LABELS[key]) out.title = LABELS[key];
	// A fixed value is set by the choice above it, so its label must not borrow another field's name.
	if (out.const !== undefined) out.title = 'Type (set by the choice above)';
	if (out.properties) {
		out.properties = Object.fromEntries(Object.entries(out.properties as Node).map(([k, v]) => [k, titled(v as Node, k)]));
	}
	if (out.items) out.items = titled(out.items);
	for (const combiner of ['oneOf', 'anyOf'] as const) {
		if (out[combiner]) {
			out[combiner] = (out[combiner] as Node[]).map((option) => {
				const t = titled(option);
				const tag = t.properties?.type?.const ?? t.properties?.kind?.const;
				if (tag && VARIANT_TITLES[tag]) t.title = VARIANT_TITLES[tag];
				else if (t.properties?.percentMac) t.title = 'Limit in % MAC';
				else if (t.properties?.arm && t.properties?.mass) t.title = 'Limit as arm';
				return t;
			});
		}
	}
	return out;
}

const root = schema as unknown as Node;
const part = (keys: string[], title: string) => ({
	title,
	keys,
	schema: titled({
		type: 'object',
		properties: Object.fromEntries(keys.map((k) => [k, root.properties[k]])),
		required: keys.filter((k) => (root.required as string[]).includes(k))
	}) as Node
});

export const SECTIONS = [
	part(['registration', 'type', 'revision', 'units', 'display', 'fictional'], 'Aircraft'),
	part(['stations', 'combinedLimits'], 'Load'),
	part(['tanks', 'burnPlans', 'defaultBurnPlan', 'fuelFlow'], 'Fuel'),
	part(['massLimits', 'envelope', 'mac', 'crosswind'], 'Limits'),
	part(['notes'], 'Notes'),
	part(['performance'], 'Performance')
];

/** A Configuration's own performance is a rare choice: here it is only "use the standard data" or "no data". */
export const CONFIGURATIONS = titled({
	type: 'object',
	properties: {
		configurations: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					id: { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9_-]*$' },
					label: { type: 'string', minLength: 1 },
					weighing: root.properties.configurations.items.properties.weighing,
					performance: { type: 'string', enum: ['none'], title: 'No performance data for this Configuration' }
				},
				required: ['id', 'label', 'weighing']
			}
		}
	}
}) as Node;

export const SOURCES = titled({
	type: 'object',
	properties: {
		sources: {
			type: 'array',
			title: 'Sources',
			items: {
				type: 'object',
				properties: { id: { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9_-]*$' }, document: { type: 'string', minLength: 1 }, revision: { type: 'string' }, page: { type: 'string' }, date: { type: 'string' } },
				required: ['id', 'document']
			}
		}
	}
}) as Node;

export type SourceRow = { id: string; document: string; revision?: string; page?: string; date?: string };

export function sourcesToRows(sources: Record<string, Omit<SourceRow, 'id'>> | undefined): SourceRow[] {
	return Object.entries(sources ?? {}).map(([id, s]) => ({ id, ...s }));
}

/** Empty optional text is dropped, because the format doesn't allow empty strings there. */
export function rowsToSources(rows: Partial<SourceRow>[] | undefined): Record<string, Omit<SourceRow, 'id'>> {
	const out: Record<string, Omit<SourceRow, 'id'>> = {};
	for (const row of rows ?? []) {
		if (!row.id) continue;
		const { id, ...rest } = row;
		out[id] = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== '' && v !== undefined)) as Omit<SourceRow, 'id'>;
	}
	return out;
}

const OPTIONAL_GROUPS = new Set(['assumes', 'mac', 'fuelFlow', 'crosswind', 'headwind', 'tailwind', 'massLimits', 'envelope']);
const isEmptyGroup = (v: unknown): boolean => {
	if (Array.isArray(v)) return v.length === 0;
	return !!v && typeof v === 'object' && Object.values(v).every(isEmptyGroup);
};

/** Drops what a form leaves behind when a field is cleared, since the format rejects unknown or empty values. */
export function cleanForFormat<T>(value: T): T {
	if (Array.isArray(value)) return value.map(cleanForFormat) as T;
	if (value && typeof value === 'object') {
		const kept = Object.entries(value).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, cleanForFormat(v)] as const);
		// A form draws optional groups even when unused. Empty ones must never reach the file.
		return Object.fromEntries(kept.filter(([k, v]) => !(OPTIONAL_GROUPS.has(k) && isEmptyGroup(v)))) as T;
	}
	return value;
}
