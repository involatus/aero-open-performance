/** Renders a document on the device, with no network. pdfmake loads only when first needed. */
export async function renderPdf(document: unknown): Promise<Blob> {
	const [{ default: pdfMake }, { default: fonts }] = await Promise.all([
		// @ts-expect-error pdfmake's browser build has no type declarations
		import('pdfmake/build/pdfmake.js'),
		// @ts-expect-error pdfmake's browser build has no type declarations
		import('pdfmake/build/vfs_fonts.js')
	]);
	pdfMake.addVirtualFileSystem(fonts);
	return pdfMake.createPdf(document).getBlob();
}
