import { renderPdf } from './report/pdf.ts';

/** Builds a small test PDF on the device, with no network. */
export async function createTestPdf(version: string): Promise<File> {
	const when = new Date().toISOString();
	const rows = [['Step', 'Value']];
	for (let i = 1; i <= 12; i++) rows.push([`Test row ${i}`, (i * 123.45).toFixed(2)]);

	const blob = await renderPdf({
		info: { title: 'Aero Open Performance device test' },
		content: [
			{ text: 'Aero Open Performance', fontSize: 20, bold: true },
			{ text: 'Device test PDF. Pre-release, not for flight. No real data.', margin: [0, 4, 0, 12] },
			{ text: `Created ${when}, version ${version}`, margin: [0, 0, 0, 12] },
			{ table: { headerRows: 1, widths: ['*', 100], body: rows } },
			{ svg: '<svg width="200" height="80"><rect width="200" height="80" fill="#d9f0e3" stroke="#16663f"/><line x1="10" y1="70" x2="190" y2="10" stroke="#14578f" stroke-width="3"/></svg>', margin: [0, 14, 0, 0] }
		]
	});
	return new File([blob], 'aero-open-performance-test.pdf', { type: 'application/pdf' });
}
