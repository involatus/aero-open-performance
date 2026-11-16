/**
 * The AoP marks and module illustrations, read from their sources in docs/brand,
 * so the app shows exactly the drawn logo and never a copy of it.
 */
import mark from '../../docs/brand/aop-mark.svg?raw';
import aircraft from '../../docs/brand/icons/aircraft.svg?url';
import sendReport from '../../docs/brand/icons/send-report.svg?url';
import working from '../../docs/brand/icons/working.svg?url';

/** The logo on its navy square, as an SVG document. */
export const MARK_SVG = mark;
/** The same with rounded corners, for places that can't round it with CSS, such as the PDF. */
export const MARK_SVG_ROUNDED = mark.replace('<rect width="512" height="512"', '<rect width="512" height="512" rx="104"');

export const ILLUSTRATIONS = { aircraft, 'send-report': sendReport, working } as const;
export type IllustrationName = keyof typeof ILLUSTRATIONS;
