/** Reads the values the tool may prefill from a raw METAR. Prefills only what the report clearly states. */
export type ParsedMetar = {
	station: string | null;
	observed: string | null;
	qnh: number | null;
	oat: number | null;
	windDirection: number | null;
	windVariable: boolean;
	windSpeed: number | null;
	flags: string[];
};

const HPA_PER_INHG = 33.8639;
const KT_PER_MPS = 1.94384;

/** METARs give only day and time. Resolved against "now", so a report near a month end stays right. */
function observedTime(day: number, hour: number, minute: number, now: number): string {
	const n = new Date(now);
	let t = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), day, hour, minute);
	if (t > now + 86400000) t = Date.UTC(n.getUTCFullYear(), n.getUTCMonth() - 1, day, hour, minute);
	return new Date(t).toISOString();
}

export function parseMetar(raw: string, now: number): ParsedMetar {
	const out: ParsedMetar = { station: null, observed: null, qnh: null, oat: null, windDirection: null, windVariable: false, windSpeed: null, flags: [] };
	// Remarks and trends can repeat group shapes, so only the main body is read.
	const body = raw.trim().split(/\s(?:RMK|NOSIG|TEMPO|BECMG)\b/)[0];

	const head = /(?:^|\s)([A-Z][A-Z0-9]{3})\s+(\d{2})(\d{2})(\d{2})Z/.exec(body);
	if (head) {
		out.station = head[1];
		out.observed = observedTime(Number(head[2]), Number(head[3]), Number(head[4]), now);
	}

	const wind = /(?:^|\s)(\d{3}|VRB|\/{3})(\d{2,3}|\/{2})(?:G(\d{2,3}))?(KT|MPS|KMH)(?=\s|$)/.exec(body);
	if (wind) {
		const unit = wind[4], speed = /^\d+$/.test(wind[2]) ? Number(wind[2]) : null;
		const toKt = (x: number) => Math.round(unit === 'MPS' ? x * KT_PER_MPS : unit === 'KMH' ? x / 1.852 : x);
		out.windSpeed = speed === null ? null : toKt(speed);
		if (wind[1] === 'VRB') { out.windVariable = true; out.flags.push('Wind is variable, so it is applied as a tailwind.'); }
		else if (/^\d{3}$/.test(wind[1])) out.windDirection = Number(wind[1]);
		if (wind[3]) out.flags.push(`Gusts to ${toKt(Number(wind[3]))} kt. Steady wind prefilled.`);
		if (unit !== 'KT') out.flags.push(`Wind converted from ${unit}.`);
		const range = /(?:^|\s)(\d{3})V(\d{3})(?=\s|$)/.exec(body);
		if (range) out.flags.push(`Wind varies from ${range[1]}° to ${range[2]}°. Main direction prefilled.`);
	}

	const temp = /(?:^|\s)(M?\d{2})\/(M?\d{2}|\/\/)?(?=\s|$)/.exec(body);
	if (temp) out.oat = Number(temp[1].replace('M', '-'));

	const q = /(?:^|\s)Q(\d{4})(?=\s|$)/.exec(body), altimeter = /(?:^|\s)A(\d{4})(?=\s|$)/.exec(body);
	if (q) out.qnh = Number(q[1]);
	else if (altimeter) {
		out.qnh = Math.round((Number(altimeter[1]) / 100) * HPA_PER_INHG);
		out.flags.push('QNH converted from inches.');
	}
	return out;
}
