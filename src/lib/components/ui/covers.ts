/**
 * A bar that stays on screen over the page, such as the sticky summary or the keypad, says how much
 * it covers. The page root turns that into scroll padding (app.css), so anything the page scrolls to,
 * or focus moves to, stops clear of the bars, without the page knowing which bars there are.
 */
import type { Attachment } from 'svelte/attachments';

export type CoveredEdge = 'top' | 'bottom';

/**
 * `{@attach covers('bottom', anything)}`: measured as soon as the bar appears, and again whenever the
 * extra arguments change, so a scroll right after a change already sees the new height.
 */
export function covers(edge: CoveredEdge, ..._remeasureOn: unknown[]): Attachment<HTMLElement> {
	return (node) => {
		const name = `--covered-${edge}`;
		const root = document.documentElement.style;
		const set = () => root.setProperty(name, `${node.offsetHeight}px`);
		set();
		const watch = new ResizeObserver(set);
		watch.observe(node);
		return () => {
			watch.disconnect();
			root.removeProperty(name);
		};
	};
}
