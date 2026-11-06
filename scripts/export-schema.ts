// Writes schema/aircraft.schema.json from the single Valibot definition.
import { writeFileSync } from 'node:fs';
import { toJsonSchema } from '@valibot/to-json-schema';
import { Aircraft } from '../src/lib/aircraft/schema.ts';

export function aircraftJsonSchema() {
	return toJsonSchema(Aircraft, { target: 'draft-2020-12', errorMode: 'ignore' });
}

if (import.meta.url === `file://${process.argv[1]}`) {
	writeFileSync('schema/aircraft.schema.json', `${JSON.stringify(aircraftJsonSchema(), null, '\t')}\n`);
}
