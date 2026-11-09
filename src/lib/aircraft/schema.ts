/**
 * The single definition of an aircraft file. See docs/FORMAT.md.
 * Every choice is required: nothing here has a hidden default.
 */
import * as v from 'valibot';

export const FORMAT_VERSION = '0.1.0';

const Text = v.pipe(v.string(), v.minLength(1));
const Id = v.pipe(v.string(), v.regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/));
const Num = v.pipe(v.number(), v.finite());
const Positive = v.pipe(Num, v.gtValue(0));
const NonNegative = v.pipe(Num, v.minValue(0));
const SourceRef = Id;

export const MassUnit = v.picklist(['kg', 'lb']);
export const ArmUnit = v.picklist(['m', 'cm', 'in']);
export const VolumeUnit = v.picklist(['L', 'USgal']);
export const DistanceUnit = v.picklist(['m', 'ft']);
export const OutOfRange = v.picklist(['none', 'nearest', 'nearestWarn']);
export const Output = v.picklist(['total', 'groundRoll']);
export const AxisInput = v.picklist(['pressureAltitude', 'densityAltitude', 'elevation', 'temperature', 'mass']);

const Source = v.strictObject({
	document: Text,
	revision: v.optional(Text),
	page: v.optional(Text),
	date: v.optional(Text)
});

const Position = v.strictObject({ id: Id, label: Text, arm: Num });
const Station = v.strictObject({
	id: Id,
	label: Text,
	arm: v.optional(Num),
	positions: v.optional(v.pipe(v.array(Position), v.minLength(1))),
	defaultPosition: v.optional(Id),
	maxMass: v.optional(Positive),
	source: SourceRef
});
const Tank = v.strictObject({ id: Id, label: Text, arm: Num, capacity: Positive, density: Positive, source: SourceRef });
const CombinedLimit = v.strictObject({
	id: Id,
	label: Text,
	stations: v.pipe(v.array(Id), v.minLength(2)),
	maxMass: Positive,
	source: SourceRef
});
const SourcedValue = v.strictObject({ value: Positive, source: SourceRef });
const MassLimits = v.strictObject({ maxTakeoff: SourcedValue, maxLanding: SourcedValue });
const EnvelopePoint = v.union([
	v.strictObject({ mass: Positive, arm: Num }),
	v.strictObject({ mass: Positive, percentMac: Num })
]);
const Envelope = v.strictObject({ points: v.pipe(v.array(EnvelopePoint), v.minLength(3)), source: SourceRef });
const Mac = v.strictObject({ leadingEdgeArm: Num, length: Positive, source: SourceRef });
const BurnPlan = v.variant('type', [
	v.strictObject({ id: Id, label: Text, type: v.literal('even') }),
	v.strictObject({ id: Id, label: Text, type: v.literal('sequence'), tanks: v.pipe(v.array(Id), v.minLength(1)) })
]);
const Note = v.strictObject({ id: Id, text: Text, source: SourceRef });
const Weighing = v.strictObject({ mass: Positive, moment: Num, date: Text, source: SourceRef });

const Axis = v.strictObject({
	name: Text,
	input: AxisInput,
	unit: Text,
	values: v.pipe(v.array(Num), v.minLength(1)),
	below: OutOfRange,
	above: OutOfRange
});
const Cells: v.GenericSchema<unknown> = v.array(v.union([Num, v.lazy(() => Cells)]));
const Table = v.strictObject({
	axes: v.pipe(v.array(Axis), v.minLength(1)),
	outputs: v.strictObject({ total: v.optional(Cells), groundRoll: v.optional(Cells) }),
	source: SourceRef,
	// A person compared the table with the manual, row by row. See src/lib/data/table-check.ts.
	checked: v.optional(v.strictObject({ by: Text, date: Text, fingerprint: v.pipe(v.string(), v.regex(/^[0-9a-f]{16}$/)) }))
});

const Applies = v.pipe(v.array(Output), v.minLength(1));
const WindRule = v.strictObject({
	mode: v.picklist(['proportional', 'stepped']),
	percent: Positive,
	perKnots: Positive,
	maxKnots: v.optional(Positive),
	above: OutOfRange
});
const Step = v.variant('type', [
	v.strictObject({ type: v.literal('lookup'), table: Id }),
	v.strictObject({
		type: v.literal('fixed'),
		total: v.optional(NonNegative),
		groundRoll: v.optional(NonNegative),
		source: SourceRef
	}),
	v.strictObject({ type: v.literal('factor'), value: Positive, applies: Applies, reason: Text, source: SourceRef }),
	v.strictObject({
		type: v.literal('massCorrection'),
		referenceMass: Positive,
		exponent: Num,
		applies: Applies,
		source: SourceRef
	}),
	v.strictObject({
		type: v.literal('wind'),
		headwind: v.optional(WindRule),
		tailwind: v.optional(WindRule),
		applies: Applies,
		source: SourceRef
	}),
	v.strictObject({
		type: v.literal('surface'),
		percent: Num,
		carryToTotal: v.boolean(),
		source: SourceRef
	}),
	v.strictObject({ type: v.literal('ratio'), from: Output, into: Output, value: Positive, source: SourceRef })
]);
const AssumedInput = v.strictObject({
	input: v.picklist(['pressureAltitude', 'densityAltitude', 'elevation', 'temperature']),
	value: Num,
	unit: Text
});
const Assumes = v.strictObject({ text: Text, inputs: v.array(AssumedInput) });
const Condition = v.variant('kind', [
	v.strictObject({
		kind: v.literal('steps'),
		id: Id,
		label: Text,
		distanceUnit: DistanceUnit,
		steps: v.pipe(v.array(Step), v.minLength(1)),
		assumes: v.optional(Assumes)
	}),
	v.strictObject({ kind: v.literal('noData'), id: Id, label: Text })
]);
const Performance = v.strictObject({
	takeoff: v.pipe(v.array(Condition), v.minLength(1)),
	landing: v.pipe(v.array(Condition), v.minLength(1))
});
const Configuration = v.strictObject({
	id: Id,
	label: Text,
	weighing: Weighing,
	massLimits: v.optional(MassLimits),
	envelope: v.optional(Envelope),
	performance: v.optional(v.union([Performance, v.literal('none')]))
});

const Quantity = v.strictObject({ value: Num, unit: DistanceUnit });
export const CalculationInput = v.strictObject({
	configuration: Id,
	loads: v.record(Id, v.strictObject({ mass: NonNegative, position: v.optional(Id) })),
	fuel: v.record(Id, NonNegative),
	burnPlan: Id,
	flightTimeHours: NonNegative,
	fuelFlow: NonNegative,
	elevation: v.nullable(Quantity),
	qnh: v.nullable(Positive),
	oat: v.nullable(Num),
	windDirection: v.nullable(Num),
	windSpeed: v.nullable(NonNegative),
	runwayHeading: v.nullable(Num),
	/** Which wind the distances use. Missing means the entered wind. */
	windForDistances: v.optional(v.picklist(['entered', 'none', 'tail3'])),
	/** The landing airfield's conditions, when it isn't the departure airfield. Missing means landing where it took off. */
	landingAt: v.optional(v.strictObject({
		elevation: v.nullable(Quantity),
		qnh: v.nullable(Positive),
		oat: v.nullable(Num),
		windDirection: v.nullable(Num),
		windSpeed: v.nullable(NonNegative),
		runwayHeading: v.nullable(Num),
		windForDistances: v.optional(v.picklist(['entered', 'none', 'tail3']))
	})),
	takeoffCondition: Id,
	landingCondition: Id
});
const ExpectedResult = v.strictObject({
	status: v.picklist(['ok', 'noData', 'noResult', 'needsInput']),
	total: v.optional(Num),
	groundRoll: v.optional(Num)
});
const HandCase = v.strictObject({
	id: Id,
	label: Text,
	author: Text,
	date: Text,
	input: CalculationInput,
	expected: v.strictObject({
		takeoffMass: v.optional(Num),
		takeoffArm: v.optional(Num),
		landingMass: v.optional(Num),
		landingArm: v.optional(Num),
		takeoff: v.optional(ExpectedResult),
		landing: v.optional(ExpectedResult),
		exceeded: v.array(Text)
	})
});

export const Aircraft = v.strictObject({
	formatVersion: Text,
	registration: Text,
	type: Text,
	revision: v.pipe(Num, v.integer(), v.minValue(1)),
	fictional: v.optional(v.boolean()),
	units: v.strictObject({ mass: MassUnit, arm: ArmUnit, volume: VolumeUnit }),
	// Only for the admin editor: values are typed as printed in the manual and stored in `units`.
	manualUnits: v.optional(v.strictObject({ mass: MassUnit, arm: ArmUnit, volume: VolumeUnit })),
	display: v.strictObject({
		massDecimals: v.pipe(Num, v.integer(), v.minValue(0)),
		armDecimals: v.pipe(Num, v.integer(), v.minValue(0))
	}),
	sources: v.record(Id, Source),
	stations: v.pipe(v.array(Station), v.minLength(1)),
	tanks: v.pipe(v.array(Tank), v.minLength(1)),
	combinedLimits: v.array(CombinedLimit),
	massLimits: MassLimits,
	envelope: Envelope,
	mac: v.optional(Mac),
	burnPlans: v.pipe(v.array(BurnPlan), v.minLength(1)),
	defaultBurnPlan: Id,
	fuelFlow: v.optional(SourcedValue),
	crosswind: v.optional(SourcedValue),
	notes: v.array(Note),
	tables: v.record(Id, Table),
	performance: Performance,
	configurations: v.pipe(v.array(Configuration), v.minLength(1)),
	handCases: v.array(HandCase),
	acknowledgedUnusualValues: v.optional(v.array(Text))
});

export type Aircraft = v.InferOutput<typeof Aircraft>;
export type CalculationInput = v.InferOutput<typeof CalculationInput>;
export type Table = v.InferOutput<typeof Table>;
export type Axis = v.InferOutput<typeof Axis>;
export type Step = v.InferOutput<typeof Step>;
export type Condition = v.InferOutput<typeof Condition>;
export type Envelope = v.InferOutput<typeof Envelope>;
export type Performance = v.InferOutput<typeof Performance>;
export type HandCase = v.InferOutput<typeof HandCase>;
export type WindRule = v.InferOutput<typeof WindRule>;
export type WindForDistances = NonNullable<CalculationInput['windForDistances']>;
